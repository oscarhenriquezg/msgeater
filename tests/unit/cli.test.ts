import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { run } from '../../src/main/cli';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');
const fixture = (name: string) => join(FIXTURES, name);

/** Ejecuta el CLI capturando lo que escribiría por stdout/stderr. */
async function cli(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const code = await run(
    argv,
    (line) => out.push(line),
    (line) => err.push(line)
  );
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('códigos de salida', () => {
  // Son el contrato con quien lo use en un script: `if msgeater-analyze x; then`.
  it('0 sin señales, 1 con señales, 2 si no se puede analizar', async () => {
    expect((await cli(fixture('html-basic.msg'))).code).toBe(0);
    expect((await cli(fixture('spoofed.eml'))).code).toBe(1);
    expect((await cli(fixture('no-existe.eml'))).code).toBe(2);
  });

  it('un archivo ilegible no impide analizar los demás', async () => {
    const { code, out, err } = await cli(fixture('no-existe.eml'), fixture('spoofed.eml'));
    expect(out).toContain('spoofed.eml'); // el bueno sí se analizó
    expect(err).toContain('no-existe.eml');
    expect(code).toBe(2); // pero el fallo se sigue reportando
  });

  it('sin argumentos muestra la ayuda y sale con error; --help sale con 0', async () => {
    expect((await cli()).code).toBe(2);
    const help = await cli('--help');
    expect(help.code).toBe(0);
    expect(help.out).toMatch(/--json/);
  });
});

// Un asunto o un nombre de adjunto pueden traer secuencias ANSI (se cuelan
// codificadas en RFC 2047, así que la cabecera cruda parece ASCII inofensivo).
// En un terminal esas secuencias mueven el cursor y borran líneas: un correo
// hostil podría tapar las señales que lo delatan en la propia salida.
describe('salida a un terminal con contenido hostil', () => {
  it('no deja pasar caracteres de control del asunto', async () => {
    const { out } = await cli(fixture('ansi-subject.eml'));
    // El fixture lleva ESC[1A ESC[2K, que sube una línea y la borra. El salto
    // de línea queda fuera del rango: separa la salida, no viene del correo.
    // eslint-disable-next-line no-control-regex -- se comprueba que NO los haya
    expect(out).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/);
    // El texto sí se conserva: se desactiva el escape, no se censura el asunto.
    expect(out).toContain('Sin se');
  });

  it('el JSON escapa los caracteres de control en vez de emitirlos crudos', async () => {
    const { out } = await cli('--json', fixture('ansi-subject.eml'));
    expect(out).not.toContain('\u001b');
    expect(out).toContain('\\u001b');

    // U+009B (CSI) hace de `ESC [` con un solo carácter y `JSON.stringify`
    // NO lo escapa: solo llega hasta U+001F. Un JSON se mira en un terminal
    // continuamente, así que se escapa aparte.
    expect(out).not.toContain('\u009b');
    expect(out).toContain('\\u009b');

    // Y sigue siendo el mismo valor al parsearlo: se escapa, no se censura.
    const parsed = JSON.parse(out) as { subject: string }[];
    expect(parsed[0]!.subject).toContain('\u009b');
  });
});

describe('salida JSON', () => {
  it('es un array con el análisis de cada archivo, sin el cuerpo del mensaje', async () => {
    const { out } = await cli(
      '--json',
      fixture('spoofed.eml'),
      fixture('office-macros.msg'),
      fixture('html-basic.msg')
    );
    const parsed = JSON.parse(out) as {
      file: string;
      signals: { kind: string }[];
      route: unknown[];
      attachments: { fileName: string; hasMacros: boolean; executable: boolean; sha256: string }[];
    }[];

    expect(parsed).toHaveLength(3);
    expect(parsed[0]!.signals.map((s) => s.kind)).toContain('homograph');
    expect(parsed[0]!.route).toHaveLength(3);

    // El cuerpo no se imprime: la salida es el análisis, no el contenido, que
    // puede ser privado y acabaría en logs y tuberías sin pedirlo nadie.
    expect(out).not.toContain('bodyHtml');
    expect(out).not.toContain('Entra en');

    const macros = parsed[1]!.attachments.find((a) => a.fileName === 'factura.docm');
    expect(macros?.hasMacros).toBe(true);
    expect(macros?.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Siempre booleano, también cuando es falso: quien filtre no debería tener
    // que distinguir «no tiene macros» de «no se sabe». El caso que lo prueba
    // es un adjunto NO ofimático: en uno ofimático el parser ya escribe `false`
    // explícito, así que ahí la normalización no se nota.
    const pdf = parsed[2]!.attachments.find((a) => a.fileName === 'informe.pdf');
    expect(pdf?.hasMacros).toBe(false);
    expect(pdf?.executable).toBe(false);
  });
});
