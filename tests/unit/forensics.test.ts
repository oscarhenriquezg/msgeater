import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAny } from '../../src/main/parser/AnyMessage';
import { computeSignals, documentIocs } from '../../src/main/forensic-analysis';
import {
  domainOf,
  extractIocs,
  parseAddressHeaders,
  sameOrganization
} from '../../src/main/headers-analysis';
import { buildSignals, type SignalInput } from '../../src/shared/forensics';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

/** Entrada mínima; cada test sobreescribe solo lo que le interesa. */
function input(over: Partial<SignalInput> = {}): SignalInput {
  return {
    auth: [],
    addresses: {},
    attachments: [],
    urls: [],
    sameOrganization,
    ...over
  };
}

describe('domainOf', () => {
  it('extrae el dominio de las dos formas de RFC 5322', () => {
    expect(domainOf('Ana <ana@empresa.com>')).toBe('empresa.com');
    expect(domainOf('ana@empresa.com')).toBe('empresa.com');
    expect(domainOf('  ANA@Empresa.COM  ')).toBe('empresa.com');
  });

  it('devuelve undefined cuando no hay dominio', () => {
    expect(domainOf(undefined)).toBeUndefined();
    expect(domainOf('')).toBeUndefined();
    expect(domainOf('<>')).toBeUndefined(); // Return-Path de un rebote
    expect(domainOf('sin-arroba')).toBeUndefined();
  });
});

describe('sameOrganization', () => {
  it('trata los subdominios como la misma organización', () => {
    expect(sameOrganization('empresa.com', 'empresa.com')).toBe(true);
    expect(sameOrganization('mail.empresa.com', 'empresa.com')).toBe(true);
    expect(sameOrganization('bounces.mail.empresa.com', 'empresa.com')).toBe(true);
  });

  it('distingue organizaciones diferentes', () => {
    expect(sameOrganization('empresa.com', 'evil.example')).toBe(false);
  });
});

describe('parseAddressHeaders', () => {
  it('lee From / Return-Path / Reply-To / Sender', () => {
    const headers = [
      'From: Banco <avisos@banco.com>',
      'Return-Path: <bounce@evil.example>',
      'Reply-To: soporte@otro.example',
      'Sender: relay@banco.com'
    ].join('\r\n');
    expect(parseAddressHeaders(headers)).toEqual({
      from: 'banco.com',
      returnPath: 'evil.example',
      replyTo: 'otro.example',
      sender: 'banco.com'
    });
  });

  it('resuelve cabeceras plegadas (folding de RFC 5322)', () => {
    const headers = 'From: Un Nombre Muy Largo\r\n <ana@empresa.com>';
    expect(parseAddressHeaders(headers).from).toBe('empresa.com');
  });
});

describe('buildSignals', () => {
  it('no marca nada en un correo normal', () => {
    const signals = buildSignals(
      input({
        auth: [{ mechanism: 'spf', result: 'pass' }],
        addresses: { from: 'empresa.com', returnPath: 'empresa.com' },
        attachments: [{ fileName: 'informe.pdf', extension: '.pdf', isInline: false }],
        urls: ['https://empresa.com/informe']
      })
    );
    expect(signals).toEqual([]);
  });

  it('marca la autenticación fallida, pero no "none" ni "neutral"', () => {
    const fail = buildSignals(input({ auth: [{ mechanism: 'dmarc', result: 'fail' }] }));
    expect(fail).toHaveLength(1);
    expect(fail[0]).toMatchObject({ kind: 'auth-fail', severity: 'high' });

    // "none"/"neutral" significan que no se pudo comprobar, no que fallara.
    const none = buildSignals(
      input({
        auth: [
          { mechanism: 'spf', result: 'none' },
          { mechanism: 'dkim', result: 'neutral' }
        ]
      })
    );
    expect(none).toEqual([]);
  });

  it('marca la discrepancia From vs Return-Path', () => {
    const signals = buildSignals(
      input({ addresses: { from: 'banco.com', returnPath: 'evil.example' } })
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]?.kind).toBe('from-mismatch');
  });

  // Falso positivo clásico: las listas de correo y los proveedores de envío
  // legítimos usan un bounce address en un subdominio propio.
  it('NO marca un Return-Path en subdominio de la misma organización', () => {
    const signals = buildSignals(
      input({ addresses: { from: 'empresa.com', returnPath: 'bounces.empresa.com' } })
    );
    expect(signals).toEqual([]);
  });

  it('marca el Reply-To desviado a otro dominio', () => {
    const signals = buildSignals(
      input({ addresses: { from: 'jefe.com', replyTo: 'atacante.example' } })
    );
    expect(signals.map((s) => s.kind)).toContain('replyto-mismatch');
  });

  it('marca adjuntos ejecutables, ignorando los inline', () => {
    const signals = buildSignals(
      input({
        attachments: [
          { fileName: 'factura.pdf.exe', extension: '.exe', isInline: false },
          { fileName: 'logo.png', extension: '.png', isInline: true }
        ]
      })
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]).toMatchObject({
      kind: 'executable-attachment',
      severity: 'high',
      detail: 'factura.pdf.exe'
    });
  });

  it('marca homografías IDN y acortadores de URL', () => {
    const signals = buildSignals(
      input({ urls: ['https://xn--80ak6aa92e.com/login', 'https://bit.ly/abc'] })
    );
    const kinds = signals.map((s) => s.kind);
    expect(kinds).toContain('homograph');
    expect(kinds).toContain('shortened-url');
  });

  // Mostrar solo el dominio decodificado sería inútil: se ve idéntico al
  // legítimo (en eso consiste el ataque). El detalle debe llevar el punycode.
  it('el detalle de homografía incluye el punycode, no solo lo que aparenta', () => {
    const signals = buildSignals(input({ urls: ['https://xn--80ak6aa92e.com/login'] }));
    const homograph = signals.find((s) => s.kind === 'homograph');
    expect(homograph?.detail).toContain('xn--80ak6aa92e.com');
    expect(homograph?.detail).toContain('аррӏе.com'); // decodificado, en cirílico
  });

  it('no repite señales para varias URLs del mismo host', () => {
    const signals = buildSignals(
      input({ urls: ['https://bit.ly/a', 'https://bit.ly/b', 'https://bit.ly/c'] })
    );
    expect(signals.filter((s) => s.kind === 'shortened-url')).toHaveLength(1);
  });

  it('ignora URLs sintácticamente inválidas sin lanzar', () => {
    expect(() => buildSignals(input({ urls: ['http://', 'no-es-una-url', ''] }))).not.toThrow();
  });
});

describe('extractIocs', () => {
  it('extrae URLs, dominios, IPs y direcciones, deduplicados', () => {
    const headers = 'Received: from mail.evil.example (203.0.113.45)\r\nFrom: a@evil.example';
    const body = 'Entra en https://evil.example/login o https://evil.example/login otra vez. Escribe a soporte@evil.example';
    const iocs = extractIocs(headers, body);

    expect(iocs.urls).toEqual(['https://evil.example/login']); // deduplicada
    expect(iocs.domains).toEqual(['evil.example']);
    expect(iocs.ips).toContain('203.0.113.45');
    expect(iocs.emails).toEqual(expect.arrayContaining(['a@evil.example', 'soporte@evil.example']));
  });

  it('no confunde con IPs inválidas', () => {
    expect(extractIocs('', 'version 999.888.777.666').ips).toEqual([]);
  });

  it('devuelve listas vacías sin contenido', () => {
    expect(extractIocs('', '')).toEqual({ urls: [], domains: [], ips: [], emails: [] });
  });
});

// --- Integración: pipeline real (parseo del fixture → señales) -------------

describe('computeSignals sobre fixtures reales', () => {
  const load = (name: string) => readFileSync(join(FIXTURES, name));

  it('detecta las señales del correo suplantado', async () => {
    const result = await parseAny(load('spoofed.eml'), 'spoofed.eml');
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // rawHeaders debe viajar en el documento (antes solo existía en Ctrl+U).
    expect(result.document.rawHeaders).toContain('Authentication-Results');

    const kinds = computeSignals(result.document).map((s) => s.kind);
    expect(kinds).toContain('auth-fail'); // spf=fail y dmarc=fail
    expect(kinds).toContain('from-mismatch'); // banco-seguro ≠ evil
    expect(kinds).toContain('replyto-mismatch'); // respuesta a atacante
    expect(kinds).toContain('shortened-url'); // bit.ly
    expect(kinds).toContain('homograph'); // аррӏе.com
  });

  it('NO marca nada en un boletín legítimo con bounce en subdominio', async () => {
    const result = await parseAny(load('legit-bounce.eml'), 'legit-bounce.eml');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(computeSignals(result.document)).toEqual([]);
  });

  // CodeQL (js/bad-tag-filter) detectó que el patrón original solo cubría
  // "</script>" exacto: HTML admite espacios antes del ">", así que un correo
  // podía colar el contenido de un script en el texto analizado.
  it('descarta scripts y estilos con cualquier forma válida de cierre', async () => {
    // HTML cierra en cuanto ve "</script" + espacio, "/" o ">": todas estas
    // formas son equivalentes para un navegador y deben tratarse igual.
    const html = [
      '<p>Visita <a href="https://legitimo.example/a">aquí</a></p>',
      '<script>var a = "https://cierre-simple.example";</script>',
      '<script>var b = "https://cierre-espacio.example";</script >',
      '<script>var c = "https://cierre-basura.example";</script\t\n bar>',
      '<script>var d = "https://cierre-barra.example";</script/>',
      '<style>body { background: url("https://desde-style.example/y"); }</style\n>'
    ].join('');
    const doc = {
      metadata: {},
      bodyHtml: html,
      attachments: [],
      rawHeaders: ''
    } as unknown as Parameters<typeof documentIocs>[0];

    const iocs = documentIocs(doc);
    expect(iocs.domains).toContain('legitimo.example'); // el enlace real sí
    for (const oculto of [
      'cierre-simple.example',
      'cierre-espacio.example',
      'cierre-basura.example',
      'cierre-barra.example',
      'desde-style.example'
    ]) {
      expect(iocs.domains).not.toContain(oculto);
    }
  });

  it('extrae los indicadores del correo suplantado', async () => {
    const result = await parseAny(load('spoofed.eml'), 'spoofed.eml');
    if (!result.ok) return;
    const iocs = documentIocs(result.document);
    expect(iocs.ips).toContain('203.0.113.45');
    expect(iocs.domains).toContain('bit.ly');
    expect(iocs.emails).toContain('rebote@evil.example');
  });
});
