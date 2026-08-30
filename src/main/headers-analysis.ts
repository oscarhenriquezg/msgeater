/**
 * Análisis técnico de cabeceras de transporte: cadena Received (el "viaje"
 * del correo, con demoras entre saltos), resultados de autenticación
 * (SPF / DKIM / DMARC / ARC), dominios de las cabeceras de dirección y
 * extracción de indicadores (IOCs).
 */

import type { Iocs } from '@shared/types';

export type { Iocs };

export interface Hop {
  from: string;
  by: string;
  /** Fecha del salto en ISO, si se pudo interpretar. */
  date?: string;
  /** Segundos transcurridos desde el salto anterior (puede ser negativo si los relojes difieren). */
  deltaSeconds?: number;
}

export interface AuthResult {
  mechanism: 'spf' | 'dkim' | 'dmarc' | 'arc';
  result: string;
}

/** Despliega las líneas continuadas (RFC 5322 folding). */
function unfold(headers: string): string {
  return headers.replace(/\r?\n[ \t]+/g, ' ');
}

/**
 * Cadena de saltos en orden cronológico (el primero es el origen).
 * En la cabecera, el Received más reciente va primero; aquí se invierte.
 */
export function parseReceivedChain(headers: string): Hop[] {
  const lines = unfold(headers).split(/\r?\n/);
  const received = lines
    .filter((l) => /^received:/i.test(l))
    .map((l) => l.replace(/^received:\s*/i, ''));

  const hops: Hop[] = received
    .map((value) => {
      const semicolon = value.lastIndexOf(';');
      const dateRaw = semicolon >= 0 ? value.slice(semicolon + 1).trim() : '';
      const parsed = dateRaw ? new Date(dateRaw) : null;
      const fromMatch = value.match(/\bfrom\s+(\S+)(?:\s+\(([^)]*)\))?/i);
      const byMatch = value.match(/\bby\s+(\S+)/i);
      return {
        from: fromMatch ? fromMatch[1] + (fromMatch[2] ? ` (${fromMatch[2]})` : '') : '—',
        by: byMatch?.[1] ?? '—',
        date: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : undefined
      };
    })
    .reverse(); // cronológico: origen primero

  for (let i = 1; i < hops.length; i++) {
    const prev = hops[i - 1]?.date;
    const curr = hops[i]?.date;
    if (prev && curr) {
      hops[i]!.deltaSeconds = Math.round((new Date(curr).getTime() - new Date(prev).getTime()) / 1000);
    }
  }
  return hops;
}

/** Dominios de las cabeceras de dirección relevantes para detectar suplantación. */
export interface AddressHeaders {
  from?: string;
  returnPath?: string;
  replyTo?: string;
  sender?: string;
}

/** Primer valor de una cabecera (sin distinguir mayúsculas), ya desplegada. */
function headerValue(lines: string[], name: string): string | undefined {
  const prefix = `${name.toLowerCase()}:`;
  const line = lines.find((l) => l.toLowerCase().startsWith(prefix));
  return line?.slice(prefix.length).trim() || undefined;
}

/**
 * Dominio de una cabecera de dirección. Acepta las dos formas de RFC 5322
 * (`Nombre <buzon@dominio>` y `buzon@dominio` a secas) y el `<>` del
 * Return-Path de los rebotes, que no tiene dominio.
 */
export function domainOf(headerValueRaw: string | undefined): string | undefined {
  if (!headerValueRaw) return undefined;
  const angle = headerValueRaw.match(/<([^>]*)>/);
  const addr = (angle ? angle[1]! : headerValueRaw).trim();
  const at = addr.lastIndexOf('@');
  if (at < 0) return undefined;
  const domain = addr.slice(at + 1).trim().toLowerCase().replace(/[>;,\s].*$/, '');
  return domain || undefined;
}

/** Dominios de From / Return-Path / Reply-To / Sender. */
export function parseAddressHeaders(headers: string): AddressHeaders {
  const lines = unfold(headers).split(/\r?\n/);
  return {
    from: domainOf(headerValue(lines, 'from')),
    returnPath: domainOf(headerValue(lines, 'return-path')),
    replyTo: domainOf(headerValue(lines, 'reply-to')),
    sender: domainOf(headerValue(lines, 'sender'))
  };
}

/**
 * ¿Dos dominios pertenecen a la misma organización? Comparación deliberadamente
 * laxa por el dominio registrable aproximado (últimas dos etiquetas): así
 * `mail.empresa.com` y `empresa.com` no se marcan como discrepancia, que sería
 * ruido en correo corporativo perfectamente normal.
 */
export function sameOrganization(a: string, b: string): boolean {
  if (a === b) return true;
  const reg = (d: string) => d.split('.').slice(-2).join('.');
  return reg(a) === reg(b);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
// IPv4 con octetos válidos (evita marcar versiones tipo "1.2.3.4" de un user-agent
// solo cuando exceden 255, que es lo máximo que se puede filtrar sin contexto).
const IPV4_RE = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;

/** Ordena y deduplica sin distinguir mayúsculas. */
function uniqSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b)
  );
}

/**
 * Extrae URLs, dominios, IPs y direcciones del mensaje, para reportar un
 * phishing sin tener que recopilarlos a mano. Trabaja sobre texto ya extraído:
 * no interpreta HTML ni hace ninguna petición de red.
 */
export function extractIocs(headers: string, bodyText: string): Iocs {
  const haystack = `${headers}\n${bodyText}`;
  const urls = uniqSorted(haystack.match(URL_RE) ?? []);
  const domains = uniqSorted(
    urls
      .map((u) => {
        try {
          return new URL(u).hostname.toLowerCase();
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  );
  return {
    urls,
    domains,
    ips: uniqSorted(haystack.match(IPV4_RE) ?? []),
    emails: uniqSorted((haystack.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase()))
  };
}

/** Resultados SPF/DKIM/DMARC/ARC de Authentication-Results y Received-SPF. */
export function parseAuthResults(headers: string): AuthResult[] {
  const lines = unfold(headers).split(/\r?\n/);
  const results: AuthResult[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    if (/^(authentication-results|arc-authentication-results):/i.test(line)) {
      for (const m of line.matchAll(/\b(spf|dkim|dmarc|arc)=([a-zA-Z0-9_-]+)/gi)) {
        const mechanism = m[1]!.toLowerCase() as AuthResult['mechanism'];
        const key = `${mechanism}:${m[2]!.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ mechanism, result: m[2]!.toLowerCase() });
        }
      }
    } else if (/^received-spf:/i.test(line)) {
      const m = line.match(/^received-spf:\s*(\w+)/i);
      if (m && !seen.has(`spf:${m[1]!.toLowerCase()}`)) {
        seen.add(`spf:${m[1]!.toLowerCase()}`);
        results.push({ mechanism: 'spf', result: m[1]!.toLowerCase() });
      }
    }
  }
  return results;
}
