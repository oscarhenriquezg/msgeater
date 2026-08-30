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
 *
 * El cierre de estos elementos NO es solo `</script>`: HTML lo da por
 * terminado en cuanto ve `</script` seguido de espacio, `/` o `>`, de modo que
 * `</script >`, `</script/>` y hasta `</script\t\n basura>` cierran igual. Un
 * correo hostil puede usar esas formas para que el contenido del script se
 * cuele en el texto analizado, así que el patrón sigue esa regla (lookahead)
 * en vez de exigir el cierre exacto.
 *
 * Limitación asumida: esto es extracción de texto con expresiones regulares,
 * no un parser de HTML, y alimenta ÚNICAMENTE el análisis de indicadores. Lo
 * que se muestra al usuario no pasa por aquí: eso lo sanitiza DOMPurify con la
 * política de `@shared/sanitize-policy`.
 */
function bodyToText(bodyHtml: string): string {
  const withoutCode = bodyHtml
    .replace(/<script\b[^>]*>[\s\S]*?<\/script(?=[\s/>])[^>]*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style(?=[\s/>])[^>]*>/gi, ' ');
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
