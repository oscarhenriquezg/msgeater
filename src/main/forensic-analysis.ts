import type { MsgDocument, Signal } from '@shared/types';
import { buildSignals } from '@shared/forensics';
import { extractIocs, parseAddressHeaders, parseAuthResults, sameOrganization } from './headers-analysis';
import type { Iocs } from './headers-analysis';

/**
 * Puente entre el análisis de cabeceras (main) y la agregación de señales
 * (shared). Se ejecuta una sola vez al abrir el documento; es barato porque
 * trabaja sobre texto ya extraído y no toca los bytes de los adjuntos.
 */

/**
 * Texto del cuerpo para buscar indicadores, sin interpretar el HTML.
 *
 * Importante: los destinos de los enlaces viven en atributos (`href`, `src`),
 * así que hay que rescatarlos ANTES de quitar las etiquetas — si no, quitar
 * `<...>` se lleva por delante justo las URLs que se quieren analizar, que es
 * el dato más relevante para detectar phishing.
 */
function bodyToText(bodyHtml: string): string {
  const withoutCode = bodyHtml
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const attrUrls = [...withoutCode.matchAll(/\b(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(
    (m) => m[1]!
  );
  return `${withoutCode.replace(/<[^>]+>/g, ' ')}\n${attrUrls.join('\n')}`;
}

/**
 * Indicadores del mensaje (URLs, dominios, IPs, direcciones). Se calcula
 * aparte de las señales porque la interfaz lo pide bajo demanda: es una lista
 * potencialmente larga que no hace falta tener cargada siempre.
 */
export function documentIocs(doc: MsgDocument): Iocs {
  return extractIocs(doc.rawHeaders ?? '', bodyToText(doc.bodyHtml));
}

/** Señales de riesgo del documento. Lista vacía = nada detectado (≠ "seguro"). */
export function computeSignals(doc: MsgDocument): Signal[] {
  const headers = doc.rawHeaders ?? '';
  // Sin cabeceras (p. ej. un .msg sin PidTagTransportMessageHeaders) todavía
  // se pueden analizar adjuntos y enlaces del cuerpo.
  const { urls } = extractIocs(headers, bodyToText(doc.bodyHtml));
  return buildSignals({
    auth: parseAuthResults(headers),
    addresses: parseAddressHeaders(headers),
    attachments: doc.attachments,
    urls,
    sameOrganization
  });
}
