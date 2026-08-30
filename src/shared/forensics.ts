import { isExecutableAttachment } from './executable';
import { homographRisk } from './homograph';

/**
 * Agregación de señales de riesgo del mensaje (triaje de phishing).
 *
 * La app ya detecta varias cosas por separado (autenticación del remitente,
 * enlaces engañosos, homografías, adjuntos ejecutables) pero cada una vive en
 * su rincón. Aquí se juntan en una sola lista para poder mostrarle al usuario
 * *qué* tiene de raro este correo sin que tenga que ser analista.
 *
 * Dos decisiones deliberadas:
 *
 *  - **No se calcula una puntuación numérica.** Un "riesgo 73/100" sugiere una
 *    precisión que no existe; se listan banderas concretas y verificables.
 *  - **La ausencia de señales no se reporta como "seguro".** Que no detectemos
 *    nada no significa que el correo sea inofensivo, así que quien consuma
 *    esto no debe pintar un "todo correcto" cuando la lista venga vacía.
 *
 * Módulo puro: sin Node, sin DOM y sin dependencias del proceso main (los
 * tipos de entrada son estructurales a propósito).
 */

export type SignalKind =
  | 'auth-fail'
  | 'from-mismatch'
  | 'replyto-mismatch'
  | 'executable-attachment'
  | 'office-macro'
  | 'homograph'
  | 'shortened-url';

export interface Signal {
  kind: SignalKind;
  /**
   * `high` se reserva a lo que casi nunca es legítimo. Una discrepancia de
   * dominio es `medium` porque las listas de correo y los proveedores de envío
   * masivo la producen de forma perfectamente normal.
   */
  severity: 'medium' | 'high';
  /** Dato concreto (dominio, archivo, URL). El texto legible lo pone el i18n. */
  detail: string;
}

/** Forma mínima de un resultado de autenticación (ver main/headers-analysis). */
export interface AuthLike {
  mechanism: string;
  result: string;
}

/** Forma mínima de los dominios de cabecera (ver main/headers-analysis). */
export interface AddressesLike {
  from?: string;
  returnPath?: string;
  replyTo?: string;
  sender?: string;
}

/** Forma mínima de un adjunto (ver shared/types MsgAttachmentMeta). */
export interface AttachmentLike {
  fileName: string;
  extension: string;
  isInline: boolean;
  hasMacros?: boolean;
}

export interface SignalInput {
  auth: AuthLike[];
  addresses: AddressesLike;
  attachments: AttachmentLike[];
  /** URLs encontradas en el mensaje (ver main/headers-analysis extractIocs). */
  urls: string[];
  /** Comparador de "misma organización"; se inyecta para no duplicar la lógica. */
  sameOrganization: (a: string, b: string) => boolean;
}

/**
 * Acortadores de URL frecuentes. No se resuelve el destino (eso exigiría salir
 * a la red, que la app no hace): solo se avisa de que el destino real no es
 * visible antes de hacer clic.
 */
const URL_SHORTENERS = new Set([
  'bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'ow.ly', 'is.gd', 'buff.ly',
  'rebrand.ly', 'cutt.ly', 'shorturl.at', 'rb.gy', 'tiny.cc', 'lnkd.in',
  't.ly', 'short.io', 'bl.ink', 'snip.ly'
]);

/** Resultados de autenticación que indican un fallo real (no "none"/"neutral"). */
const AUTH_FAILURES = new Set(['fail', 'softfail', 'permerror', 'temperror']);

export function buildSignals(input: SignalInput): Signal[] {
  const signals: Signal[] = [];

  // 1. Autenticación del remitente fallida. "none" y "neutral" NO cuentan:
  //    significan que no se pudo comprobar, no que la comprobación fallara.
  for (const a of input.auth) {
    if (AUTH_FAILURES.has(a.result.toLowerCase())) {
      signals.push({
        kind: 'auth-fail',
        severity: 'high',
        detail: `${a.mechanism.toUpperCase()}=${a.result.toLowerCase()}`
      });
    }
  }

  // 2. Suplantación: el dominio que dice enviar no coincide con el real.
  const { from, returnPath, replyTo } = input.addresses;
  if (from && returnPath && !input.sameOrganization(from, returnPath)) {
    signals.push({ kind: 'from-mismatch', severity: 'medium', detail: `${from} ≠ ${returnPath}` });
  }
  // Respuesta desviada a otro dominio: técnica habitual en fraude del CEO.
  if (from && replyTo && !input.sameOrganization(from, replyTo)) {
    signals.push({ kind: 'replyto-mismatch', severity: 'medium', detail: `${from} → ${replyTo}` });
  }

  // 3. Adjuntos que pueden ejecutar código.
  //
  // Se miran TAMBIÉN los marcados como inline: `Content-Disposition: inline`
  // lo elige quien envía, no garantiza que sea una imagen del cuerpo, y un
  // .eml puede etiquetar así un `malware.exe`. Como la interfaz de adjuntos
  // los sigue ofreciendo para abrir y guardar, saltárselos escondería la
  // señal de un archivo que el usuario puede ejecutar igualmente.
  for (const att of input.attachments) {
    if (isExecutableAttachment(att.extension)) {
      signals.push({
        kind: 'executable-attachment',
        severity: 'high',
        detail: att.fileName
      });
    }
    // Un documento ofimático con macros es una vía de entrega de malware
    // habitual y no se distingue a simple vista de uno inofensivo.
    if (att.hasMacros) {
      signals.push({ kind: 'office-macro', severity: 'high', detail: att.fileName });
    }
  }

  // 4. Enlaces con homografía IDN o acortados.
  const seenHosts = new Set<string>();
  for (const url of input.urls) {
    let host: string;
    try {
      host = new URL(url).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (seenHosts.has(host)) continue;
    seenHosts.add(host);

    const homograph = homographRisk(host);
    if (homograph.risk) {
      // Se muestran las DOS formas a propósito. Enseñar solo la decodificada
      // (аррӏе.com) sería inútil: se ve idéntica a la legítima, que es
      // justamente en lo que consiste el ataque. El punycode (xn--...) es la
      // forma inequívoca, y la decodificada explica qué está imitando.
      signals.push({ kind: 'homograph', severity: 'high', detail: `${host} → ${homograph.decoded}` });
    }
    if (URL_SHORTENERS.has(host)) {
      signals.push({ kind: 'shortened-url', severity: 'medium', detail: host });
    }
  }

  return signals;
}
