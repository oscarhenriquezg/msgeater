import { describe, expect, it } from 'vitest';
import { sanitizeAttachmentName } from '../../src/shared/attachment-name';

describe('sanitizeAttachmentName', () => {
  it('deja intactos los nombres normales', () => {
    expect(sanitizeAttachmentName('informe.pdf')).toBe('informe.pdf');
    expect(sanitizeAttachmentName('Foto Vacaciones (2).jpg')).toBe('Foto Vacaciones (2).jpg');
  });

  it('recorta path traversal con barras normales', () => {
    expect(sanitizeAttachmentName('../../escaped.txt')).toBe('escaped.txt');
    expect(sanitizeAttachmentName('a/b/../../c/evil.txt')).toBe('evil.txt');
  });

  it('recorta path traversal con barras invertidas (adjuntos de Windows)', () => {
    expect(sanitizeAttachmentName('..\\..\\evil.txt')).toBe('evil.txt');
    expect(sanitizeAttachmentName('C:\\Windows\\evil.exe')).toBe('evil.exe');
  });

  it('recorta rutas absolutas', () => {
    expect(sanitizeAttachmentName('/etc/passwd')).toBe('passwd');
  });

  it('cae al fallback cuando el nombre resultante es "..", "." o vacío', () => {
    expect(sanitizeAttachmentName('..')).toBe('adjunto');
    expect(sanitizeAttachmentName('.')).toBe('adjunto');
    expect(sanitizeAttachmentName('')).toBe('adjunto');
    expect(sanitizeAttachmentName('../..')).toBe('adjunto');
    expect(sanitizeAttachmentName('   ')).toBe('adjunto');
  });

  it('acepta un fallback personalizado', () => {
    expect(sanitizeAttachmentName('..', 'sin-nombre')).toBe('sin-nombre');
  });
});
