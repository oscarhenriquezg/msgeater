/**
 * Análisis técnico de cabeceras de transporte: cadena Received (el "viaje"
 * del correo, con demoras entre saltos), resultados de autenticación
 * (SPF / DKIM / DMARC / ARC), dominios de las cabeceras de dirección y
 * extracción de indicadores (IOCs).
 */

import type { Iocs, MessageHop } from '@shared/types';

export type { Iocs };
export type Hop = MessageHop;

export interface AuthResult {
  mechanism: 'spf' | 'dkim' | 'dmarc' | 'arc';
  result: string;
}

/** Despliega las líneas continuadas (RFC 5322 folding). */
function unfold(headers: string): string {
  return headers.replace(/\r?\n[ \t]+/g, ' ');
}

/** Octeto 0-255: evita confundir un número de versión con una IP. */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_BODY = `${OCTET}(?:\\.${OCTET}){3}`;
/**
 * IPv4 como token COMPLETO. `\b` no sirve: también hay frontera de palabra
 * antes de un punto, así que en `mail-1.2.3.4.5.example` extraería `1.2.3.4`
 * —una dirección inventada— y además, al ser la primera coincidencia, ganaría
 * a la IP real que venga después. El nombre de ese host lo elige quien envía,
 * de modo que sería una IP falsa a voluntad del atacante en un panel cuyo
 * propósito es que alguien la copie para reportarla o bloquearla.
 */
const IPV4_TOKEN = new RegExp(`(?<![\\w.-])(${IPV4_BODY})(?![\\w.-])`);
const IPV4_EMBEDDED = new RegExp(`(?:^|:)(${IPV4_BODY})$`);
/** Candidato entre corchetes; la validación real la hace `isIpv6`. */
const IPV6_CANDIDATE = /\[(?:IPv6:)?([0-9a-f:.]+)\]/i;

/**
 * ¿Es `value` una dirección IPv6 válida? Hace falta comprobarlo de verdad: un
 * patrón laxo acepta `1::2::3` o la hora `13:40:30` (y el prefijo `IPv6:` no
 * añade validez, solo lo declara quien escribe la cabecera), y a la vez
 * rechaza formas legítimas con IPv4 embebida como `::ffff:192.0.2.1`.
 */
function isIpv6(value: string): boolean {
  let text = value;
  let expected = 8;

  // Cola IPv4 embebida (`::ffff:192.0.2.1`): ocupa los dos últimos grupos.
  const embedded = text.match(IPV4_EMBEDDED);
  if (embedded) {
    text = text.slice(0, text.length - embedded[1]!.length);
    if (!text.endsWith(':')) return false;
    text = text.slice(0, -1);
    expected = 6;
  }

  const sides = text.split('::');
  if (sides.length > 2) return false; // la compresión solo puede aparecer una vez

  const groupsOf = (side: string) => (side === '' ? [] : side.split(':'));
  const head = groupsOf(sides[0]!);
  const tail = sides.length === 2 ? groupsOf(sides[1]!) : [];
  if (![...head, ...tail].every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return false;

  // Sin `::` han de estar los ocho grupos; con `::` sustituye al menos a uno.
  return sides.length === 2 ? head.length + tail.length < expected : head.length === expected;
}

/**
 * IP del emisor declarada en un salto. Se busca SOLO en la cláusula `from`:
 * la parte `by ... with ESMTP id ...` lleva versiones de software y números de
 * identificación que un patrón de IPv4 confundiría con direcciones.
 */
function hopIp(receivedValue: string): string | undefined {
  const by = receivedValue.search(/\bby\s/i);
  const fromClause = by > 0 ? receivedValue.slice(0, by) : receivedValue;
  const candidate = fromClause.match(IPV6_CANDIDATE)?.[1];
  if (candidate && isIpv6(candidate)) return candidate;
  return fromClause.match(IPV4_TOKEN)?.[1];
}

/**
 * Nombre inverso anotado entre paréntesis (`from x (rdns.example [ip])`).
 * Se descarta si repite el nombre anunciado —no aporta nada— y si no es un
 * host (`unknown`, o la propia IP): solo se conserva cuando de verdad revela
 * que el emisor se anunció con un nombre distinto del que resuelve su IP.
 */
function hopRdns(parenthetical: string | undefined, announced: string): string | undefined {
  const first = parenthetical?.trim().split(/\s+/)[0]?.replace(/[[\]]/g, '');
  if (!first || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(first)) return undefined;
  return first.toLowerCase() === announced.toLowerCase() ? undefined : first;
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
      // El nombre anunciado va solo, sin el paréntesis: lo que este contiene
      // (rDNS e IP) se expone en campos aparte para no repetir el mismo dato
      // dos veces en la interfaz. Un literal `[1.2.3.4]` pierde los corchetes
      // para poder compararlo con `ip`.
      // `by host; fecha` es la forma habitual, así que el token arrastra el
      // punto y coma que separa la fecha; sin quitarlo se muestra pegado al
      // nombre y no sirve para copiar ni comparar.
      const announced = fromMatch?.[1]?.replace(/^\[|\]$/g, '').replace(/[;,]+$/, '') ?? '—';
      return {
        from: announced,
        by: byMatch?.[1]?.replace(/[;,]+$/, '') ?? '—',
        rdns: hopRdns(fromMatch?.[2], announced),
        ip: hopIp(value),
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
 * Sufijos públicos de dos niveles bajo los que cualquiera puede registrar.
 *
 * Sin esta lista, quedarse con las dos últimas etiquetas hace que
 * `bank.co.uk` y `attacker.co.uk` se reduzcan ambos a `co.uk` y se traten como
 * la misma organización — es decir, se SUPRIMIRÍA la señal justo en un caso de
 * suplantación real. Con la lista, el dominio registrable de `bank.co.uk` es
 * el propio `bank.co.uk`.
 *
 * No es la Public Suffix List completa (son miles de entradas y exigiría una
 * dependencia nueva); cubre los sufijos de uso masivo. Ante un sufijo no
 * listado el resultado es el comportamiento anterior, que puede generar un
 * falso negativo: por eso, si alguna vez hay que ampliar, el criterio es
 * añadir sufijos, nunca quitar.
 */
const MULTI_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au', 'id.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz', 'ac.nz',
  'com.br', 'net.br', 'org.br', 'gov.br', 'edu.br',
  'com.ar', 'com.mx', 'com.co', 'com.pe', 'com.uy', 'com.ve', 'com.ec',
  'co.jp', 'ne.jp', 'or.jp', 'ac.jp', 'go.jp',
  'co.kr', 'or.kr', 'go.kr',
  'com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn',
  'co.in', 'net.in', 'org.in', 'gov.in', 'ac.in',
  'co.za', 'org.za', 'gov.za',
  'com.tr', 'com.sg', 'com.hk', 'com.tw', 'com.my', 'com.ph', 'com.vn',
  'com.es', 'com.pl', 'com.ua', 'co.il', 'com.sa', 'com.eg', 'com.ng'
]);

/**
 * Dominio registrable: la etiqueta que alguien registra, más su sufijo. Para
 * `mail.empresa.com` es `empresa.com`; para `mail.bank.co.uk`, `bank.co.uk`.
 */
export function registrableDomain(domain: string): string {
  const labels = domain.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  // Sufijo de dos niveles → hace falta una etiqueta más para llegar al
  // dominio que de verdad se registró.
  return MULTI_LABEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

/**
 * ¿Dos dominios pertenecen a la misma organización? Comparación deliberadamente
 * laxa por el dominio registrable: así `mail.empresa.com` y `empresa.com` no se
 * marcan como discrepancia, que sería ruido en correo corporativo normal.
 */
export function sameOrganization(a: string, b: string): boolean {
  if (a === b) return true;
  return registrableDomain(a) === registrableDomain(b);
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
