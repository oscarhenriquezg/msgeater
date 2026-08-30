/**
 * Detección de macros VBA en adjuntos ofimáticos, **sin ejecutar nada**: solo
 * se busca la huella del proyecto VBA dentro de los bytes del archivo.
 *
 * Un documento con macros es una de las vías de entrega de malware más
 * habituales por correo, y no se distingue a simple vista de uno inofensivo:
 * la extensión puede mentir (un `.docx` puede llevar macros) y el icono es el
 * mismo. De ahí que valga la pena mirarlo.
 *
 * Módulo puro: recibe bytes, no toca disco ni red.
 */

/** Extensiones ofimáticas que pueden contener un proyecto VBA. */
const OFFICE_EXTENSIONS = new Set([
  // OOXML (ZIP): las terminadas en "m" son las que declaran macros, pero se
  // revisan también las "x" porque un archivo mal nombrado sigue abriéndose.
  '.docx', '.docm', '.dotx', '.dotm',
  '.xlsx', '.xlsm', '.xltx', '.xltm', '.xlam',
  '.pptx', '.pptm', '.potx', '.potm', '.ppam', '.ppsx', '.ppsm',
  // Formatos binarios antiguos (OLE/CFBF)
  '.doc', '.dot', '.xls', '.xlt', '.xla', '.ppt', '.pot', '.pps'
]);

export function isOfficeAttachment(extension: string): boolean {
  if (!extension) return false;
  const ext = extension.toLowerCase();
  return OFFICE_EXTENSIONS.has(ext.startsWith('.') ? ext : `.${ext}`);
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const CFBF_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, magic: number[]): boolean {
  if (bytes.length < magic.length) return false;
  return magic.every((b, i) => bytes[i] === b);
}

/** ¿Aparece esta secuencia de bytes en el buffer? */
function includesBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
}

/** UTF-16LE, que es como el directorio de un CFBF guarda los nombres de stream. */
function utf16le(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    out[i * 2] = code & 0xff;
    out[i * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

/**
 * ¿El adjunto contiene un proyecto VBA?
 *
 * - **OOXML** (`.docx`/`.xlsm`/…): es un ZIP y los nombres de sus entradas van
 *   en claro en el archivo, así que basta con encontrar `vbaProject.bin`.
 * - **OLE/CFBF** (`.doc`/`.xls` antiguos): el directorio guarda los nombres de
 *   stream en UTF-16LE; un proyecto VBA aparece como `_VBA_PROJECT` o `Macros`.
 *
 * Es una heurística sobre bytes, no un análisis del documento: puede haber
 * falsos negativos si el archivo está cifrado o comprimido de forma que oculte
 * esos nombres. Por eso alimenta una señal informativa, no un bloqueo.
 */
export function hasOfficeMacros(bytes: Uint8Array, extension: string): boolean {
  if (!isOfficeAttachment(extension) || bytes.length === 0) return false;

  if (startsWith(bytes, ZIP_MAGIC)) {
    return includesBytes(bytes, ascii('vbaProject.bin'));
  }
  if (startsWith(bytes, CFBF_MAGIC)) {
    return (
      includesBytes(bytes, utf16le('_VBA_PROJECT')) || includesBytes(bytes, utf16le('Macros'))
    );
  }
  return false;
}
