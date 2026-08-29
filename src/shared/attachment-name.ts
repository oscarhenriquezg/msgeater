/**
 * Nombre de adjunto seguro para usarlo como ruta de archivo o entrada de ZIP.
 * El nombre original viene del correo (no confiable): un `../../evil.txt`
 * no debe poder escapar del directorio o carpeta destino elegidos por el
 * usuario. `path.basename()` no basta por sí solo: `basename('..')` devuelve
 * `'..'` sin cambios, y `join(dir, '..')` sigue resolviendo al padre de `dir`.
 */
export function sanitizeAttachmentName(name: string, fallback = 'adjunto'): string {
  const last = name.replace(/\\/g, '/').split('/').pop() ?? '';
  const trimmed = last.trim();
  return trimmed === '' || trimmed === '.' || trimmed === '..' ? fallback : trimmed;
}
