/**
 * Capturas de la landing (site/img), en español e inglés.
 *
 * Los fixtures de tests tienen cuerpos mínimos —sirven para probar, no para
 * enseñar—, así que aquí se generan dos mensajes de demostración con contenido
 * realista. Todo es inventado y usa dominios `.example` reservados: NUNCA se
 * captura un correo real, igual que no se sube ninguno a servicios externos.
 *
 * Uso:  npm run build && node scripts/make-landing-shots.mjs
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'site', 'img');
const WORK = mkdtempSync(join(tmpdir(), 'msgeater-shots-'));
mkdirSync(OUT, { recursive: true });

/** Ventana ancha y no muy alta: en la web se ve a un tamaño reducido. */
const SIZE = { width: 1180, height: 720 };

// ---------------------------------------------------------------------------
// Mensajes de demostración
// ---------------------------------------------------------------------------

/** Adjunto MIME en base64. */
function part(boundary, { type, name, content }) {
  return [
    `--${boundary}`,
    `Content-Type: ${type}; name="${name}"`,
    'Content-Transfer-Encoding: base64',
    `Content-Disposition: attachment; filename="${name}"`,
    '',
    Buffer.from(content).toString('base64').replace(/(.{76})/g, '$1\r\n'),
    ''
  ].join('\r\n');
}

function multipart(headers, html, attachments) {
  const boundary = 'msgeater-demo-boundary';
  return [
    ...headers,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    html,
    '',
    ...attachments.map((a) => part(boundary, a)),
    `--${boundary}--`,
    ''
  ].join('\r\n');
}

/** ZIP mínimo con la huella de un proyecto VBA (dispara la señal de macros). */
const DOCM_WITH_MACROS = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('word/document.xml word/vbaProject.bin')
]);
const FAKE_PDF = Buffer.from('%PDF-1.4\n% documento de ejemplo\n');

// Los mensajes existen en los dos idiomas: una captura de la interfaz en
// inglés con un correo en español se contradice a sí misma.
const COPY = {
  es: {
    normalSubject: 'Cierre trimestral Q2 — informe y anexos',
    normalBody: `<p>Hola Oscar,</p>
<p>Te paso el <b>cierre del segundo trimestre</b>. Los ingresos recurrentes
crecen un 12&nbsp;% respecto a Q1 y el margen se mantiene estable pese al
aumento de costes de infraestructura.</p>
{TABLE}
<p>El detalle est&aacute; en el PDF adjunto y los datos en bruto en el CSV, por si
quieres rehacer las tablas.</p>
<p>Un saludo,<br><b>Ana P&eacute;rez</b><br>
<span style="color:#57606a">Controller &middot; Empresa Ejemplo</span></p>`,
    cols: ['Concepto', 'Q1', 'Q2'],
    rows: [['Ingresos recurrentes', '418 K&euro;', '468 K&euro;'],
           ['Costes de infraestructura', '96 K&euro;', '109 K&euro;']],
    normalAtt: ['cierre-Q2.pdf', 'datos-Q2.csv'],
    phishSubject: 'Acción requerida: verifica tu cuenta',
    phishBody: `<p style="font-size:15px"><b>Estimado cliente:</b></p>
<p>Hemos detectado un acceso inusual a su cuenta desde un dispositivo no
reconocido. Por su seguridad hemos <b>suspendido temporalmente</b> las
transferencias.</p>
<p>Para restablecerlas debe verificar su identidad en las pr&oacute;ximas
<b>24 horas</b>:</p>
{BUTTON}
<p style="font-size:13px;color:#57606a">Si el bot&oacute;n no funciona, entre en
<a href="http://portal-seguro.evil.example/login">www.banco-ejemplo.example</a>
o consulte el aviso en <a href="https://xn--80ak6aa92e.com/aviso">apple.com</a>.</p>
<p style="font-size:13px;color:#57606a">Adjuntamos el detalle del incidente.</p>`,
    phishButton: 'Verificar mi cuenta',
    phishAtt: ['incidencia-4471.docm', 'aviso-legal.pdf'],
    from: '"Ana Perez" <ana.perez@empresa.example>',
    to: '"Oscar Henriquez" <oscar@empresa.example>',
    cc: '"Direccion Financiera" <finanzas@empresa.example>',
    phishFrom: '"Soporte Banco Ejemplo" <avisos@banco-ejemplo.example>',
    phishReply: '"Soporte" <respuestas@atacante.example>',
    phishTo: 'victima@empresa.example',
    relay: 'relevo.evil.example',
    mx: 'mx.empresa.example',
    inbox: 'buzon.empresa.example'
  },
  en: {
    normalSubject: 'Q2 close — report and annexes',
    normalBody: `<p>Hi Oscar,</p>
<p>Here is the <b>second-quarter close</b>. Recurring revenue is up 12&nbsp;%
against Q1 and the margin holds steady despite higher infrastructure costs.</p>
{TABLE}
<p>The breakdown is in the attached PDF and the raw figures are in the CSV, in
case you want to rebuild the tables.</p>
<p>Best,<br><b>Ana Perez</b><br>
<span style="color:#57606a">Controller &middot; Example Corp</span></p>`,
    cols: ['Item', 'Q1', 'Q2'],
    rows: [['Recurring revenue', '&euro;418K', '&euro;468K'],
           ['Infrastructure costs', '&euro;96K', '&euro;109K']],
    normalAtt: ['q2-close.pdf', 'q2-figures.csv'],
    phishSubject: 'Action required: verify your account',
    phishBody: `<p style="font-size:15px"><b>Dear customer:</b></p>
<p>We have detected unusual access to your account from an unrecognised
device. For your security we have <b>temporarily suspended</b> transfers.</p>
<p>To restore them you must verify your identity within the next
<b>24 hours</b>:</p>
{BUTTON}
<p style="font-size:13px;color:#57606a">If the button does not work, go to
<a href="http://portal-seguro.evil.example/login">www.example-bank.example</a>
or read the notice at <a href="https://xn--80ak6aa92e.com/aviso">apple.com</a>.</p>
<p style="font-size:13px;color:#57606a">The incident report is attached.</p>`,
    phishButton: 'Verify my account',
    phishAtt: ['incident-4471.docm', 'legal-notice.pdf'],
    from: '"Ana Perez" <ana.perez@example-corp.example>',
    to: '"Oscar Henriquez" <oscar@example-corp.example>',
    cc: '"Finance Department" <finance@example-corp.example>',
    phishFrom: '"Example Bank Support" <alerts@example-bank.example>',
    phishReply: '"Support" <replies@attacker.example>',
    phishTo: 'victim@example-corp.example',
    relay: 'relay.evil.example',
    mx: 'mx.example-corp.example',
    inbox: 'mailbox.example-corp.example'
  }
};

const BASE = 'font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1f2328;line-height:1.55';

/** Cabecera RFC 2047 en base64: el asunto lleva acentos. */
const encodeSubject = (text) =>
  `Subject: =?utf-8?B?${Buffer.from(text, 'utf-8').toString('base64')}?=`;

function table(c) {
  const th = c.cols
    .map((h, i) => `<th align="${i ? 'right' : 'left'}" style="border:1px solid #d9dde3">${h}</th>`)
    .join('');
  const tr = c.rows
    .map((r) => '<tr>' + r
      .map((v, i) => `<td align="${i ? 'right' : 'left'}" style="border:1px solid #d9dde3">${i === 2 ? `<b>${v}</b>` : v}</td>`)
      .join('') + '</tr>')
    .join('');
  return `<table cellpadding="8" cellspacing="0" style="border-collapse:collapse;margin:14px 0">
  <tr style="background:#f3f4f6">${th}</tr>${tr}</table>`;
}

function buildNormal(c) {
  return multipart(
    [
      `From: ${c.from}`,
      `To: ${c.to}`,
      `Cc: ${c.cc}`,
      encodeSubject(c.normalSubject),
      'Date: Tue, 10 Jun 2025 09:24:11 +0200'
    ],
    `<html><body style="${BASE}">${c.normalBody.replace('{TABLE}', table(c))}</body></html>`,
    [
      { type: 'application/pdf', name: c.normalAtt[0], content: FAKE_PDF },
      { type: 'text/csv', name: c.normalAtt[1], content: 'item;q1;q2\nrevenue;418000;468000\n' }
    ]
  );
}

function buildPhishing(c) {
  const button = `<p style="margin:18px 0">
  <a href="https://bit.ly/verificar-cuenta"
     style="background:#0a5ad6;color:#fff;padding:10px 18px;border-radius:6px;
            text-decoration:none;font-weight:600">${c.phishButton}</a>
</p>`;
  return multipart(
    [
      `From: ${c.phishFrom}`,
      'Return-Path: <rebote@evil.example>',
      `Reply-To: ${c.phishReply}`,
      `To: ${c.phishTo}`,
      encodeSubject(c.phishSubject),
      'Date: Tue, 10 Jun 2025 03:12:44 +0200',
      `Authentication-Results: ${c.mx}; spf=fail smtp.mailfrom=evil.example; dkim=fail; dmarc=fail`,
      `Received: from ${c.mx} (${c.mx} [192.0.2.10])`,
      `\tby ${c.inbox} with ESMTPS;`,
      '\tTue, 10 Jun 2025 03:14:58 +0200',
      // El nombre anunciado y el que resuelve su IP no coinciden: es justo lo
      // que la línea de tiempo señala como rDNS discrepante.
      `Received: from ${c.relay} (vps-17.cheap-hosting.example [198.51.100.7])`,
      `\tby ${c.mx} with ESMTP;`,
      '\tTue, 10 Jun 2025 03:12:58 +0200',
      `Received: from evil.example (203.0.113.45) by ${c.relay}; Tue, 10 Jun 2025 03:12:44 +0200`
    ],
    `<html><body style="${BASE}">${c.phishBody.replace('{BUTTON}', button)}</body></html>`,
    [
      { type: 'application/vnd.ms-word.document.macroEnabled.12', name: c.phishAtt[0], content: DOCM_WITH_MACROS },
      { type: 'application/pdf', name: c.phishAtt[1], content: FAKE_PDF }
    ]
  );
}

const DEMO = {};
for (const lang of ['es', 'en']) {
  const normal = join(WORK, `normal-${lang}.eml`);
  const phishing = join(WORK, `phishing-${lang}.eml`);
  writeFileSync(normal, buildNormal(COPY[lang]));
  writeFileSync(phishing, buildPhishing(COPY[lang]));
  DEMO[lang] = { normal, phishing };
}


// ---------------------------------------------------------------------------
// Capturas
// ---------------------------------------------------------------------------

async function withApp({ lang, theme, file, height = SIZE.height }, fn) {
  const locale = lang === 'es' ? 'es_ES.UTF-8' : 'en_US.UTF-8';
  const app = await electron.launch({
    args: ['.', file],
    cwd: ROOT,
    // TZ fija: las cabeceras del demo son +0200, así que sin esto la fecha
    // mostrada no cuadraría con la que se ve en la vista de código fuente.
    env: {
      ...process.env,
      MSGEATER_NO_ASSOC_PROMPT: '1',
      LANG: locale,
      LC_ALL: locale,
      TZ: 'Europe/Madrid'
    }
  });
  const page = await app.firstWindow();
  await page.waitForSelector('#header');
  // El tema se emula sobre la propia página: la interfaz lo resuelve con
  // `prefers-color-scheme`, y así la web puede enseñar a cada visitante la
  // variante que corresponde a su sistema. (`nativeTheme.themeSource` desde el
  // proceso main no llegaba a afectar al renderer ya cargado.)
  await page.emulateMedia({ colorScheme: theme });
  await app.evaluate(({ BrowserWindow }, opts) => {
    BrowserWindow.getAllWindows()[0]?.setSize(opts.width, opts.height);
  }, { width: SIZE.width, height });
  await page.waitForTimeout(600);
  try {
    await fn(app, page);
  } finally {
    await app.close();
  }
}

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

for (const lang of ['es', 'en']) {
  for (const theme of ['light', 'dark']) {
    const sfx = `${lang}-${theme}`;
    const { normal, phishing } = DEMO[lang];

    // Ventana más corta: este correo es breve y con 720 px sobraba media
    // captura en blanco.
    await withApp({ lang, theme, file: normal, height: 620 }, async (_app, page) => {
      await page.waitForTimeout(700);
      await shot(page, `main-${sfx}`);
    });

    await withApp({ lang, theme, file: phishing }, async (_app, page) => {
      await page.click('#btn-forensics');
      await page.waitForSelector('#forensics-dialog[open]');
      await page.waitForTimeout(400);
      await shot(page, `analysis-${sfx}`);

      // La ruta va en captura aparte: desplegada dentro del mismo diálogo queda
      // por debajo del pliegue y no se vería.
      await page.click('#forensics-route-title');
      await page.waitForSelector('.route-hop');
      await page.locator('#forensics-route-box').scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot(page, `route-${sfx}`);
    });

    await withApp({ lang, theme, file: phishing, height: 620 }, async (_app, page) => {
      await page.click('#btn-link-warn');
      await page.click('#btn-linkwarn-confirm');
      // El aviso emergente de confirmación tapa el cuerpo: se espera a que se
      // desvanezca en vez de fotografiarlo por encima del contenido.
      await page.locator('.toast').last().waitFor({ state: 'detached', timeout: 15000 });
      await page.waitForTimeout(300);
      await shot(page, `phishing-${sfx}`);
    });

    await withApp({ lang, theme, file: phishing }, async (app, page) => {
      const [srcWin] = await Promise.all([app.waitForEvent('window'), page.click('#btn-source')]);
      await srcWin.waitForLoadState('domcontentloaded');
      await srcWin.emulateMedia({ colorScheme: theme });
      await srcWin.waitForTimeout(1400);
      await shot(srcWin, `source-${sfx}`);
    });

    console.log(`capturas ${sfx}: ok`);
  }
}

console.log('Capturas en', OUT);
