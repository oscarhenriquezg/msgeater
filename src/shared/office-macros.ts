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

/** Nombres de entrada de directorio que delatan un proyecto VBA. */
const VBA_ENTRY_NAMES = new Set(['_vba_project', 'macros', '_vba_project_cur', 'vba']);

/** Tamaño de una entrada del directorio CFBF, según la especificación. */
const DIR_ENTRY_SIZE = 128;

/**
 * ¿Hay una entrada de *directorio* CFBF con nombre de proyecto VBA?
 *
 * Deliberadamente NO se busca la cadena suelta por todo el archivo: un
 * documento perfectamente inocuo que hable de macros llevaría la palabra
 * "Macros" en su texto y produciría un falso positivo — y esta señal es de
 * severidad alta y le dice al usuario que el adjunto contiene macros.
 *
 * En vez de eso se recorre el archivo en posiciones alineadas a 128 bytes (el
 * tamaño de una entrada de directorio) y se valida la estructura: longitud de
 * nombre coherente, tipo de objeto válido (storage/stream/root) y nombre
 * exacto. No es un parser CFBF completo —no se sigue la cadena FAT— pero
 * exige que los bytes parezcan de verdad una entrada de directorio.
 */
function hasVbaDirectoryEntry(bytes: Uint8Array): boolean {
  for (let off = 0; off + DIR_ENTRY_SIZE <= bytes.length; off += DIR_ENTRY_SIZE) {
    // uint16 LE: longitud del nombre en bytes, incluido el terminador nulo.
    const nameLen = bytes[off + 64]! | (bytes[off + 65]! << 8);
    if (nameLen < 4 || nameLen > 64 || nameLen % 2 !== 0) continue;

    // 0x01 storage, 0x02 stream, 0x05 root. Cualquier otro no es una entrada.
    const objectType = bytes[off + 66]!;
    if (objectType !== 0x01 && objectType !== 0x02 && objectType !== 0x05) continue;

    let name = '';
    for (let i = 0; i < nameLen - 2; i += 2) {
      name += String.fromCharCode(bytes[off + i]! | (bytes[off + i + 1]! << 8));
    }
    if (VBA_ENTRY_NAMES.has(name.toLowerCase())) return true;
  }
  return false;
}

/**
 * ¿El adjunto contiene un proyecto VBA?
 *
 * - **OOXML** (`.docx`/`.xlsm`/…): es un ZIP y los nombres de sus entradas van
 *   en claro en el archivo, así que basta con encontrar `vbaProject.bin`.
 * - **OLE/CFBF** (`.doc`/`.xls` antiguos): se busca una entrada de directorio
 *   llamada `_VBA_PROJECT` o `Macros`, validando la estructura (ver
 *   `hasVbaDirectoryEntry`) para no confundirla con el texto del documento.
 *
 * Es una heurística sobre bytes, no un análisis del documento: puede haber
 * falsos negativos si el archivo está cifrado o comprimido de forma que oculte
 * esos nombres. Por eso alimenta una señal informativa, no un bloqueo.
 */
export function hasOfficeMacros(bytes: Uint8Array, extension: string): boolean {
  if (!isOfficeAttachment(extension) || bytes.length === 0) return false;

  if (startsWith(bytes, ZIP_MAGIC)) {
    // En un ZIP los nombres de entrada van en claro en las cabeceras, y
    // "vbaProject.bin" no es texto que aparezca por casualidad.
    return includesBytes(bytes, ascii('vbaProject.bin'));
  }
  if (startsWith(bytes, CFBF_MAGIC)) {
    return hasVbaDirectoryEntry(bytes);
  }
  return false;
}
