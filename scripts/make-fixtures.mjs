/**
 * Genera el corpus de fixtures .msg para tests (NFR-07):
 * válidos, corruptos, truncados y adversariales.
 *
 * Los .msg se construyen como contenedores CFBF reales (paquete `cfb`)
 * con los streams MAPI que consume el parser. Para añadir correos reales
 * al corpus, copia cualquier .msg a tests/fixtures/real/ — los tests los
 * recogen automáticamente.
 */
import * as CFB from 'cfb';
import iconv from 'iconv-lite';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'tests', 'fixtures');
mkdirSync(outDir, { recursive: true });
mkdirSync(join(outDir, 'real'), { recursive: true });

/** Codifica string como UTF-16LE (PT_UNICODE → sufijo 001F). */
const utf16 = (s) => Buffer.from(s, 'utf16le');

/**
 * properties stream mínimo: cabecera de 32 bytes (mensaje raíz).
 * msgreader lee los string/binary props desde streams __substg1.0_*.
 */
function propertiesStream(headerBytes, entries = []) {
  const header = Buffer.alloc(headerBytes);
  if (headerBytes >= 24) {
    // next recipient id, next attachment id, recipient count, attachment count
    header.writeUInt32LE(entries.recipientCount ?? 0, 8 + 0);
    header.writeUInt32LE(entries.attachmentCount ?? 0, 8 + 4);
    header.writeUInt32LE(entries.recipientCount ?? 0, 8 + 8);
    header.writeUInt32LE(entries.attachmentCount ?? 0, 8 + 12);
  }
  return header;
}

function buildMsg({ subject, senderName, senderEmail, bodyHtml, bodyText, compressedRtf, recipients = [], attachments = [], messageClass = 'IPM.Note' }) {
  const cfb = CFB.utils.cfb_new();
  const add = (path, content) => CFB.utils.cfb_add(cfb, path, content);

  add('/__properties_version1.0', propertiesStream(32, {
    recipientCount: recipients.length,
    attachmentCount: attachments.length
  }));
  add('/__substg1.0_001A001F', utf16(messageClass)); // PidTagMessageClass
  if (subject !== undefined) add('/__substg1.0_0037001F', utf16(subject));
  if (senderName) add('/__substg1.0_0C1A001F', utf16(senderName));
  if (senderEmail) add('/__substg1.0_0C1F001F', utf16(senderEmail));
  if (bodyText) add('/__substg1.0_1000001F', utf16(bodyText));
  if (bodyHtml) add('/__substg1.0_10130102', Buffer.from(bodyHtml, 'utf-8')); // PidTagHtml
  if (compressedRtf) add('/__substg1.0_10090102', compressedRtf); // PidTagRtfCompressed

  recipients.forEach((r, i) => {
    const p = `/__recip_version1.0_#${i.toString(16).toUpperCase().padStart(8, '0')}`;
    add(`${p}/__properties_version1.0`, propertiesStream(8));
    add(`${p}/__substg1.0_3001001F`, utf16(r.name));
    add(`${p}/__substg1.0_3003001F`, utf16(r.email)); // PidTagEmailAddress (puede ser DN)
    if (r.smtp !== null) add(`${p}/__substg1.0_39FE001F`, utf16(r.smtp ?? r.email));
  });

  attachments.forEach((a, i) => {
    const p = `/__attach_version1.0_#${i.toString(16).toUpperCase().padStart(8, '0')}`;
    add(`${p}/__properties_version1.0`, propertiesStream(8));
    add(`${p}/__substg1.0_3707001F`, utf16(a.fileName)); // long filename
    add(`${p}/__substg1.0_3703001F`, utf16(a.extension ?? '')); // extension
    if (a.contentId) add(`${p}/__substg1.0_3712001F`, utf16(a.contentId));
    add(`${p}/__substg1.0_37010102`, a.content); // attach data
  });

  return Buffer.from(CFB.write(cfb, { type: 'buffer' }));
}

/**
 * .msg ANSI: cadenas en streams 001E (PtypString8) codificadas en un codepage
 * no latino, con PR_MESSAGE_CODEPAGE (3FFD0003) declarado en el property stream.
 * Sirve para verificar que el parser evita el mojibake (no asume latin1).
 */
function buildAnsiMsg({ subject, bodyText, senderName, senderEmail, recipients = [], codepage }) {
  const cfb = CFB.utils.cfb_new();
  const add = (path, content) => CFB.utils.cfb_add(cfb, path, content);
  const ansi = (s) => iconv.encode(s, `cp${codepage}`);
  // Property stream raíz: cabecera de 32 bytes (con recipientCount) + 1 entrada
  // de 16 bytes con PR_MESSAGE_CODEPAGE (tag 0x3FFD0003, tipo integer).
  const header = propertiesStream(32, { recipientCount: recipients.length });
  const entry = Buffer.alloc(16);
  entry.writeUInt32LE(0x3ffd0003, 0); // propertyTag
  entry.writeUInt32LE(0x06, 4); // flags
  entry.writeUInt32LE(codepage, 8); // valor int32 = codepage
  add('/__properties_version1.0', Buffer.concat([header, entry]));
  add('/__substg1.0_001A001F', utf16('IPM.Note'));
  add('/__substg1.0_0037001E', ansi(subject)); // subject ANSI
  add('/__substg1.0_1000001E', ansi(bodyText)); // body ANSI
  if (senderName) add('/__substg1.0_0C1A001E', ansi(senderName)); // sender name ANSI
  if (senderEmail) add('/__substg1.0_5D01001F', utf16(senderEmail)); // sender SMTP (ASCII)

  recipients.forEach((r, i) => {
    const p = `/__recip_version1.0_#${i.toString(16).toUpperCase().padStart(8, '0')}`;
    add(`${p}/__properties_version1.0`, propertiesStream(8));
    add(`${p}/__substg1.0_3001001E`, ansi(r.name)); // display name ANSI
    add(`${p}/__substg1.0_39FE001F`, utf16(r.email)); // SMTP (ASCII)
  });
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }));
}

/** Envuelve RTF en el formato PidTagRtfCompressed sin compresión (COMPTYPE "MELA"). */
function lzfuUncompressed(rtf) {
  const body = Buffer.from(rtf, 'latin1');
  const header = Buffer.alloc(16);
  header.writeUInt32LE(body.length + 12, 0);
  header.writeUInt32LE(body.length, 4);
  header.write('MELA', 8, 'ascii');
  return Buffer.concat([header, body]);
}

const RTF_ENCAPSULATED = String.raw`{\rtf1\ansi\ansicpg1252\fromhtml1 \deff0{\fonttbl{\f0\fswiss Arial;}}
{\*\htmltag64 <html>}{\*\htmltag64 <body>}{\*\htmltag64 <p>}\htmlrtf \f0 \htmlrtf0 Texto desde RTF encapsulado{\*\htmltag72 </p>}{\*\htmltag64 </body>}{\*\htmltag64 </html>}}`;

const RTF_PLAIN = String.raw`{\rtf1\ansi\deff0{\fonttbl{\f0 Arial;}}\f0 Correo antiguo en RTF puro.\par Segunda l\'ednea.}`;

// PNG 1x1 rojo válido para imagen inline.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// ---------------------------------------------------------------------------
// Fixtures válidos
// ---------------------------------------------------------------------------

writeFileSync(join(outDir, 'html-basic.msg'), buildMsg({
  subject: 'Informe trimestral Q2',
  senderName: 'Ana Pérez',
  senderEmail: 'ana.perez@example.com',
  bodyHtml: '<html><body><h1>Informe</h1><p>Resultados del <b>Q2</b> adjuntos.</p><p><a href="https://intranet.example.com/q2">Ver detalle</a></p></body></html>',
  bodyText: 'Informe\nResultados del Q2 adjuntos.',
  recipients: [
    { name: 'Oscar Henríquez', email: 'oscar@example.com', type: 'to' },
    { name: 'Copia Dept', email: 'dept@example.com', type: 'cc' }
  ],
  attachments: [
    { fileName: 'informe.pdf', extension: '.pdf', content: Buffer.from('%PDF-1.4 fake fixture') },
    { fileName: 'datos.csv', extension: '.csv', content: Buffer.from('a;b;c\n1;2;3\n') }
  ]
}));

// Nombre de adjunto malicioso (path traversal / zip slip): "Guardar todos" y
// "Exportar ZIP" deben confinar la escritura al directorio/carpeta destino.
writeFileSync(join(outDir, 'path-traversal.msg'), buildMsg({
  subject: 'Adjunto con nombre malicioso',
  senderName: 'Mallory',
  senderEmail: 'mallory@evil.example',
  bodyText: 'Adjunto con path traversal en el nombre.',
  attachments: [
    { fileName: 'informe.pdf', extension: '.pdf', content: Buffer.from('%PDF-1.4 fake fixture') },
    { fileName: '../../escaped.txt', extension: '.txt', content: Buffer.from('pwned') }
  ]
}));

// --- Adjuntos ofimáticos con y sin macros (detección sin ejecutar nada) ----

/** OOXML mínimo pero real: un ZIP cuyas entradas se listan en claro. */
function buildOoxml(entryNames) {
  // Se usa CFB.write en modo zip para no añadir una dependencia solo por esto.
  const cfb = CFB.utils.cfb_new();
  for (const name of entryNames) {
    CFB.utils.cfb_add(cfb, name, Buffer.from('x'));
  }
  return Buffer.from(CFB.write(cfb, { type: 'buffer', fileType: 'zip' }));
}

/** Documento OLE antiguo: los nombres de stream van en UTF-16LE en el CFBF. */
function buildOleDoc(streamNames) {
  const cfb = CFB.utils.cfb_new();
  for (const name of streamNames) {
    CFB.utils.cfb_add(cfb, name, Buffer.from('x'));
  }
  return Buffer.from(CFB.write(cfb, { type: 'buffer' }));
}

writeFileSync(join(outDir, 'office-macros.msg'), buildMsg({
  subject: 'Factura adjunta',
  senderName: 'Proveedor',
  senderEmail: 'facturacion@proveedor.example',
  bodyText: 'Adjuntamos la factura del mes.',
  attachments: [
    // .docm con proyecto VBA → debe marcarse
    { fileName: 'factura.docm', extension: '.docm',
      content: buildOoxml(['word/document.xml', 'word/vbaProject.bin']) },
    // .xls antiguo con macros → debe marcarse
    { fileName: 'balance.xls', extension: '.xls',
      content: buildOleDoc(['Workbook', '_VBA_PROJECT']) },
    // .docx equivalente SIN macros → no debe marcarse (control del falso positivo)
    { fileName: 'anexo.docx', extension: '.docx',
      content: buildOoxml(['word/document.xml', 'word/styles.xml']) },
    // Extensión declarada mentirosa: PidTagAttachExtension dice ".txt" pero el
    // nombre visible es .docm. La propiedad MAPI la controla quien envía, así
    // que la detección no puede fiarse solo de ella.
    { fileName: 'nomina.docm', extension: '.txt',
      content: buildOoxml(['word/document.xml', 'word/vbaProject.bin']) }
  ]
}));

writeFileSync(join(outDir, 'ansi-cyrillic.msg'), buildAnsiMsg({
  subject: 'Привет, отчёт',
  bodyText: 'Текст письма в кодировке Windows-1251.',
  senderName: 'Иван Петров',
  senderEmail: 'ivan.petrov@example.ru',
  recipients: [{ name: 'Мария Сидорова', email: 'maria@example.ru' }],
  codepage: 1251
}));

writeFileSync(join(outDir, 'phishing-link.msg'), buildMsg({
  subject: 'Verifica tu cuenta',
  senderName: 'Soporte',
  senderEmail: 'soporte@phish.example',
  // Un enlace engañoso (texto muestra paypal.com, va a evil) y uno honesto.
  bodyHtml: '<html><body>' +
    '<p><a id="bad" href="http://evil-phish.example/login">www.paypal.com</a></p>' +
    '<p><a id="ok" href="https://www.paypal.com/account">Ir a mi cuenta</a></p>' +
    '<p><a id="plain" href="https://intranet.example.com/x">ver aquí</a></p>' +
    '</body></html>',
  bodyText: 'Verifica tu cuenta',
  recipients: [{ name: 'Víctima', email: 'victima@example.com', type: 'to' }]
}));

writeFileSync(join(outDir, 'inline-image.msg'), buildMsg({
  subject: 'Con imagen inline',
  senderName: 'Ana Pérez',
  senderEmail: 'ana.perez@example.com',
  bodyHtml: '<html><body><p>Logo:</p><img src="cid:logo123" alt="logo"></body></html>',
  attachments: [
    { fileName: 'logo.png', extension: '.png', contentId: 'logo123', content: PNG_1PX }
  ]
}));

writeFileSync(join(outDir, 'hostile-script.msg'), buildMsg({
  subject: 'XSS attempt',
  senderName: 'Mallory',
  senderEmail: 'mallory@evil.example',
  bodyHtml: `<html><body onload="alert('owned')">
    <script>window.PWNED = true;</script>
    <p onclick="alert(1)">Hola</p>
    <a href="javascript:alert(2)">link</a>
    <img src="https://tracker.evil.example/pixel.png">
    <iframe src="https://evil.example"></iframe>
  </body></html>`
}));

writeFileSync(join(outDir, 'plaintext-only.msg'), buildMsg({
  subject: 'Solo texto',
  senderName: 'Bob',
  senderEmail: 'bob@example.com',
  bodyText: 'Línea 1\nLínea 2 con <caracteres> & "especiales"'
}));

// Mensaje interno de Exchange: PidTagEmailAddress trae el DN X.500.
const EXCHANGE_DN =
  '/o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Recipients/cn=ab12cd34ef56-Usuario Interno';
writeFileSync(join(outDir, 'exchange-dn.msg'), buildMsg({
  subject: 'Interno Exchange',
  senderName: 'Remitente Interna',
  senderEmail: 'remitente@example.cl',
  bodyText: 'mensaje interno',
  recipients: [
    { name: 'Usuario Interno', email: EXCHANGE_DN, smtp: 'usuario.interno@example.cl', type: 'to' },
    { name: 'Solo DN Sin SMTP', email: EXCHANGE_DN, smtp: null, type: 'cc' }
  ]
}));

writeFileSync(join(outDir, 'rtf-encapsulated.msg'), buildMsg({
  subject: 'Cuerpo RTF con HTML encapsulado',
  senderName: 'Carol',
  senderEmail: 'carol@example.com',
  compressedRtf: lzfuUncompressed(RTF_ENCAPSULATED)
}));

writeFileSync(join(outDir, 'rtf-plain.msg'), buildMsg({
  subject: 'Cuerpo RTF puro',
  senderName: 'Dave',
  senderEmail: 'dave@example.com',
  compressedRtf: lzfuUncompressed(RTF_PLAIN)
}));

writeFileSync(join(outDir, 'calendar-unsupported.msg'), buildMsg({
  subject: 'Reunión',
  messageClass: 'IPM.Appointment',
  bodyText: 'no soportado'
}));

writeFileSync(join(outDir, 'smime-encrypted.msg'), buildMsg({
  subject: 'Cifrado',
  messageClass: 'IPM.Note.SMIME'
}));

// ---------------------------------------------------------------------------
// Fixtures corruptos / adversariales (NFR-07)
// ---------------------------------------------------------------------------

// No-CFBF: bytes aleatorios con extensión .msg.
writeFileSync(join(outDir, 'random-bytes.msg'), Buffer.from(Array.from({ length: 4096 }, (_, i) => (i * 37) % 256)));

// ZIP renombrado a .msg.
writeFileSync(join(outDir, 'renamed-zip.msg'), Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(2048)]));

// Truncado: un .msg válido cortado a la mitad.
const valid = readFileSync(join(outDir, 'html-basic.msg'));
writeFileSync(join(outDir, 'truncated.msg'), valid.subarray(0, Math.floor(valid.length / 3)));

// Solo firma CFBF, sin estructura.
writeFileSync(join(outDir, 'header-only.msg'), Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(100)
]));

// Vacío.
writeFileSync(join(outDir, 'empty.msg'), Buffer.alloc(0));

// ---------------------------------------------------------------------------
// Fixture EML (RFC 5322) con multipart, imagen cid: y adjunto
// ---------------------------------------------------------------------------

const EML_SAMPLE = [
  'Received: from mx.example.net (mx.example.net [203.0.113.9])',
  '\tby destino.example.com with ESMTPS;',
  '\tMon, 10 Jun 2024 12:00:45 +0000',
  'Received: from origen.example.org (origen.example.org [198.51.100.7])',
  '\tby mx.example.net with ESMTP;',
  '\tMon, 10 Jun 2024 12:00:05 +0000',
  'Authentication-Results: mx.example.net; spf=pass smtp.mailfrom=example.com;',
  '\tdkim=pass header.d=example.com; dmarc=pass',
  'From: "Ana Pérez" <ana.perez@example.com>',
  'To: "Oscar Henríquez" <oscar@example.com>',
  'Cc: dept@example.com',
  'Subject: =?utf-8?B?' + Buffer.from('Correo EML de prueba').toString('base64') + '?=',
  'Date: Mon, 10 Jun 2024 12:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="MIX"',
  '',
  '--MIX',
  'Content-Type: multipart/alternative; boundary="ALT"',
  '',
  '--ALT',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Versión en texto plano.',
  '--ALT',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><h1>EML</h1><p>Con <b>imagen</b>:</p><img src="cid:foto1"><script>window.PWNED=1</script></body></html>',
  '--ALT--',
  '--MIX',
  'Content-Type: image/png',
  'Content-Transfer-Encoding: base64',
  'Content-ID: <foto1>',
  'Content-Disposition: inline; filename="foto.png"',
  '',
  PNG_1PX.toString('base64'),
  '--MIX',
  'Content-Type: text/csv; name="datos.csv"',
  'Content-Transfer-Encoding: base64',
  'Content-Disposition: attachment; filename="datos.csv"',
  '',
  Buffer.from('x;y\n1;2\n').toString('base64'),
  '--MIX--',
  ''
].join('\r\n');
writeFileSync(join(outDir, 'sample.eml'), EML_SAMPLE);

// .msg renombrado a .eml: la detección debe ser por contenido.
writeFileSync(join(outDir, 'renamed-msg.eml'), readFileSync(join(outDir, 'html-basic.msg')));

// .eml exportado desde Exchange con el DN X.500 en To (debe limpiarse a SMTP/vacío).
const EML_DN = [
  'From: "Remitente Interna" </o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Recipients/cn=aa11-Remitente>',
  'To: "Rodrigo Pinto Rojas" </o=ExchangeLabs/ou=Exchange Administrative Group (FYDIBOHF23SPDLT)/cn=Recipients/cn=51b04ace-Rodrigo Pin>',
  'Cc: "Real Persona" <real.persona@example.cl>',
  'Subject: Interno con DN',
  'Date: Mon, 10 Jun 2024 12:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'cuerpo'
].join('\r\n');
writeFileSync(join(outDir, 'eml-exchange-dn.eml'), EML_DN);

// Correo con varias señales de riesgo simultáneas (triaje de phishing):
// SPF/DMARC en fail, Return-Path de otro dominio, Reply-To desviado, enlace
// acortado y homografía IDN (аррӏе.com en cirílico).
const EML_SPOOFED = [
  'From: "Soporte Banco" <avisos@banco-seguro.example>',
  'Return-Path: <rebote@evil.example>',
  'Reply-To: "Soporte" <respuestas@atacante.example>',
  'To: victima@empresa.example',
  'Subject: Verifica tu cuenta',
  'Date: Mon, 10 Jun 2024 12:00:00 +0000',
  'Authentication-Results: mx.empresa.example; spf=fail smtp.mailfrom=evil.example; dmarc=fail',
  // Cadena de tres saltos (la cabecera los lleva del más reciente al más
  // antiguo) para ejercitar la línea de tiempo: origen declarado, relevo
  // intermedio y entrega final, con una demora apreciable en el último tramo.
  'Received: from mx.empresa.example (mx.empresa.example [192.0.2.10])',
  '\tby buzon.empresa.example with ESMTPS;',
  '\tMon, 10 Jun 2024 12:02:20 +0000',
  'Received: from relevo.evil.example (relevo.evil.example [198.51.100.7])',
  '\tby mx.empresa.example with ESMTP;',
  '\tMon, 10 Jun 2024 12:00:20 +0000',
  'Received: from evil.example (203.0.113.45) by relevo.evil.example; Mon, 10 Jun 2024 12:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Entra en <a href="https://bit.ly/verificar">tu cuenta</a> o en',
  '<a href="https://xn--80ak6aa92e.com/login">apple.com</a>.</p>'
].join('\r\n');
writeFileSync(join(outDir, 'spoofed.eml'), EML_SPOOFED);

// Contraparte legítima: Return-Path en un subdominio propio (lo que hace
// cualquier lista de correo o proveedor de envío) NO debe marcarse.
const EML_LEGIT_BOUNCE = [
  'From: "Boletin" <news@empresa.example>',
  'Return-Path: <bounce-123@bounces.empresa.example>',
  'To: suscriptor@otra.example',
  'Subject: Boletin mensual',
  'Date: Mon, 10 Jun 2024 12:00:00 +0000',
  'Authentication-Results: mx.otra.example; spf=pass; dkim=pass; dmarc=pass',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Novedades del mes.'
].join('\r\n');
writeFileSync(join(outDir, 'legit-bounce.eml'), EML_LEGIT_BOUNCE);

// Asunto con secuencias de escape ANSI, codificado en RFC 2047 (que es como
// se cuelan: la cabecera cruda es ASCII inofensivo y el parser las decodifica).
// El payload es ESC[1A ESC[2K "Sin señales de riesgo": en un terminal sube una
// línea, la borra y escribe su propio texto encima — es decir, un correo
// hostil reescribiendo la salida del análisis que lo delata.
const EML_ANSI_SUBJECT = [
  'From: "Remitente" <alguien@example.com>',
  'To: victima@empresa.example',
  'Subject: =?utf-8?B?G1sxQRtbMktTaW4gc2XDsWFsZXMgZGUgcmllc2dv?=',
  'Date: Mon, 10 Jun 2024 12:00:00 +0000',
  'MIME-Version: 1.0',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Cuerpo irrelevante.'
].join('\r\n');
writeFileSync(join(outDir, 'ansi-subject.eml'), EML_ANSI_SUBJECT);

// EMLX (Apple Mail): nº de bytes + RFC822 + plist de metadatos.
const emlxMsg = Buffer.from(EML_SAMPLE, 'utf-8');
const emlxPlist =
  '<?xml version="1.0" encoding="UTF-8"?>\n<plist version="1.0"><dict>' +
  '<key>flags</key><integer>8623</integer></dict></plist>\n';
writeFileSync(
  join(outDir, 'sample.emlx'),
  Buffer.concat([Buffer.from(`${emlxMsg.length}\n`), emlxMsg, Buffer.from(emlxPlist)])
);

console.log('Fixtures generados en', outDir);
