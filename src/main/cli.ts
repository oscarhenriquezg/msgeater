/**
 * Análisis de mensajes desde la línea de comandos, sin abrir ventana.
 *
 * Existe porque el triaje de un buzón entero no se hace abriendo correos de
 * uno en uno: aquí se puede recorrer un directorio, filtrar por señales y
 * encadenar el resultado con otras herramientas.
 *
 * No importa nada de `electron`: es Node puro, así que funciona **sin
 * servidor gráfico** —por SSH, en un contenedor o en un cron— tanto con
 * `node` como con el binario de la app en modo Node (`ELECTRON_RUN_AS_NODE=1`).
 *
 * Igual que la interfaz, no toca la red (NFR-03) y no imprime el cuerpo del
 * mensaje: la salida es el análisis, no el contenido, que puede ser privado y
 * acabaría en logs y tuberías sin que nadie lo haya pedido.
 */

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import type { MessageHop, MsgAttachmentMeta, MsgDocument, Signal } from '@shared/types';
import { isExecutableAttachment } from '@shared/executable';
import { getAllAttachmentHashes, parseAny } from './parser/AnyMessage';
import { computeSignals, documentIocs, documentRoute } from './forensic-analysis';
// Los textos salen de los MISMOS ficheros que usa la ventana: si el CLI
// tuviera su propia copia acabarían diciendo cosas distintas de la misma
// señal, que es peor que la mezcla de capas que supone importarlos.
import es from '../renderer/src/i18n/es.json';
import en from '../renderer/src/i18n/en.json';

/**
 * Códigos de salida, pensados para `if msgeater-analyze correo.eml; then …`:
 * 0 no se detectó ninguna señal, 1 se detectó alguna, 2 no se pudo analizar.
 *
 * `0` significa exactamente eso —ninguna de las señales que se comprueban—,
 * NO que el mensaje sea seguro; el propio `--help` lo dice.
 */
const EXIT_CLEAN = 0;
const EXIT_SIGNALS = 1;
const EXIT_ERROR = 2;

const strings: Record<string, string> = /^es/i.test(
  process.env['LC_ALL'] || process.env['LANG'] || ''
)
  ? (es as Record<string, string>)
  : (en as Record<string, string>);

function t(key: string, vars: Record<string, string> = {}): string {
  const template = strings[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? '');
}

/**
 * Texto de origen no confiable listo para escribir en un terminal.
 *
 * Un asunto o un nombre de adjunto pueden traer secuencias de escape ANSI, y
 * en un terminal esas secuencias mueven el cursor y reescriben lo ya impreso:
 * un correo hostil podría falsificar la salida del propio análisis que lo
 * delata, borrando sus señales de la pantalla. La salida `--json` no lo
 * necesita porque `JSON.stringify` ya escapa los caracteres de control.
 */
function plain(text: string): string {
  // eslint-disable-next-line no-control-regex -- filtrarlos es justo el objetivo
  return text.replace(/[\u0000-\u001f\u007f-\u009f]/g, '');
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['kB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

function formatDate(iso?: string): string {
  return iso ? iso.replace('T', ' ').replace(/\.\d+Z$/, 'Z') : '—';
}

function formatDelay(seconds?: number): string {
  if (seconds === undefined) return '';
  if (seconds < 0) return ` · ${t('forensics.route.skew')}`;
  if (seconds < 120) return ` · +${seconds} s`;
  if (seconds < 7200) return ` · +${Math.round(seconds / 60)} min`;
  return ` · +${Math.round(seconds / 3600)} h`;
}

interface Analysis {
  file: string;
  subject: string;
  from: { name: string; email: string };
  sentDate?: string;
  signals: Signal[];
  route: MessageHop[];
  iocs: ReturnType<typeof documentIocs>;
  // `hasMacros` y `executable` van siempre como booleano, no ausentes cuando
  // son falsos: quien filtre el JSON no debería tener que distinguir «no tiene
  // macros» de «no se sabe».
  attachments: (Pick<MsgAttachmentMeta, 'fileName' | 'size'> & {
    hasMacros: boolean;
    sha256?: string;
    executable: boolean;
  })[];
}

async function analyze(file: string): Promise<Analysis> {
  const buffer = await readFile(file);
  const result = await parseAny(buffer, file);
  if (!result.ok) {
    throw new Error(t(`error.${result.error.code}`, { detail: result.error.detail ?? '' }));
  }
  const doc: MsgDocument = result.document;
  doc.signals = computeSignals(doc);

  const hashes = new Map((await getAllAttachmentHashes(buffer)).map((h) => [h.id, h.sha256]));
  return {
    file,
    subject: doc.metadata.subject,
    from: doc.metadata.from,
    sentDate: doc.metadata.sentDate,
    signals: doc.signals,
    route: documentRoute(doc),
    iocs: documentIocs(doc),
    attachments: doc.attachments.map((a) => ({
      fileName: a.fileName,
      size: a.size,
      hasMacros: a.hasMacros === true,
      sha256: hashes.get(a.id),
      executable: isExecutableAttachment(a.fileName)
    }))
  };
}

function printText(analysis: Analysis, out: (line: string) => void): void {
  out(plain(analysis.file));
  out(`  ${t('cli.subject')}: ${plain(analysis.subject) || t('header.noSubject')}`);
  const { name, email } = analysis.from;
  out(`  ${t('cli.from')}: ${plain(name ? `${name} <${email}>` : email)}`);
  out(`  ${t('cli.sent')}: ${formatDate(analysis.sentDate)}`);

  out('');
  if (analysis.signals.length === 0) {
    out(`  ${t('forensics.noSignals')}`);
  } else {
    out(`  ${t('cli.signals')} (${analysis.signals.length})`);
    for (const signal of analysis.signals) {
      const level = t(`cli.severity.${signal.severity}`);
      out(`    [${level}] ${plain(t(`forensics.sig.${signal.kind}`, { detail: signal.detail }))}`);
    }
  }

  if (analysis.route.length > 0) {
    out('');
    out(`  ${t('forensics.route')} (${analysis.route.length})`);
    analysis.route.forEach((hop, i) => {
      const ip = hop.ip && hop.ip !== hop.from ? ` [${hop.ip}]` : '';
      const rdns = hop.rdns ? ` (${t('forensics.route.rdns', { rdns: hop.rdns })})` : '';
      out(
        `    ${i + 1}. ${plain(hop.from)}${ip}${rdns} → ${plain(hop.by)} · ` +
          `${formatDate(hop.date)}${formatDelay(hop.deltaSeconds)}`
      );
    });
    out(`    ${t('forensics.route.hint')}`);
  }

  if (analysis.attachments.length > 0) {
    out('');
    out(`  ${t('cli.attachments')} (${analysis.attachments.length})`);
    for (const att of analysis.attachments) {
      const flags = [
        att.executable ? t('cli.flag.executable') : '',
        att.hasMacros ? t('cli.flag.macros') : ''
      ].filter(Boolean);
      out(
        `    ${plain(att.fileName)} · ${formatSize(att.size)}${flags.length ? ` · ${flags.join(' ')}` : ''}`
      );
      if (att.sha256) out(`      sha256:${att.sha256}`);
    }
  }

  const groups: [string, string[]][] = [
    [t('forensics.iocs.urls'), analysis.iocs.urls],
    [t('forensics.iocs.domains'), analysis.iocs.domains],
    [t('forensics.iocs.ips'), analysis.iocs.ips],
    [t('forensics.iocs.emails'), analysis.iocs.emails]
  ];
  const present = groups.filter(([, values]) => values.length > 0);
  if (present.length > 0) {
    out('');
    out(`  ${t('forensics.iocs')}`);
    for (const [title, values] of present) {
      out(`    ${title} (${values.length})`);
      for (const value of values) out(`      ${plain(value)}`);
    }
  }
  out('');
}

const HELP = `msgeater-analyze — ${t('cli.tagline')}

  msgeater-analyze [--json] <archivo…>

  --json     ${t('cli.help.json')}
  -h, --help ${t('cli.help.help')}

${t('cli.help.exit')}

${t('cli.help.disclaimer')}
`;

export async function run(
  argv: string[],
  out: (line: string) => void = console.log,
  err: (line: string) => void = console.error
): Promise<number> {
  let values: { json?: boolean; help?: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      args: argv,
      options: { json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' } },
      allowPositionals: true
    }));
  } catch (error) {
    err(String(error instanceof Error ? error.message : error));
    return EXIT_ERROR;
  }

  if (values.help || positionals.length === 0) {
    out(HELP);
    return values.help ? EXIT_CLEAN : EXIT_ERROR;
  }

  const results: Analysis[] = [];
  let failed = false;
  for (const file of positionals) {
    try {
      results.push(await analyze(file));
    } catch (error) {
      // Un archivo ilegible no aborta los demás: en un triaje por lotes
      // interesa el resultado del resto.
      err(`${plain(file)}: ${plain(error instanceof Error ? error.message : String(error))}`);
      failed = true;
    }
  }

  if (values.json) out(JSON.stringify(results, null, 2));
  else for (const analysis of results) printText(analysis, out);

  if (failed) return EXIT_ERROR;
  return results.some((r) => r.signals.length > 0) ? EXIT_SIGNALS : EXIT_CLEAN;
}

// Solo se ejecuta cuando este módulo ES el programa invocado; al importarlo
// desde los tests no se dispara.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await run(process.argv.slice(2));
}
