#!/usr/bin/env node
// jevidence replay | calibrate | report | lint-panel
//
// Four verbs, no dependencies. Every one of them reads JSON and writes JSON or markdown, so
// the CLI is only ever a thin way into the same functions the library exports.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fakeClient, httpClient, sdkClient, type JevClient } from './core/client.js';
import { calibrate, calibrationMarkdown } from './core/calibrate.js';
import { jsonlLedger, readRecords } from './core/ledger.js';
import { lintPanel, loadPanel } from './core/panel.js';
import { replay } from './core/replay.js';
import { report } from './core/report.js';
import { LabelSchema, type Label } from './core/types.js';

interface Args {
  command: string;
  positional: string[];
  flags: { [key: string]: string | boolean };
}

export function parseArgs(argv: string[]): Args {
  const [command = 'help', ...rest] = argv;
  const positional: string[] = [];
  const flags: { [key: string]: string | boolean } = {};
  for (let i = 0; i < rest.length; i++) {
    const token = rest[i] as string;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const eq = token.indexOf('=');
    if (eq > 0) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[token.slice(2)] = next;
      i += 1;
    } else {
      flags[token.slice(2)] = true;
    }
  }
  return { command, positional, flags };
}

const str = (flags: Args['flags'], name: string): string | undefined => (typeof flags[name] === 'string' ? (flags[name] as string) : undefined);
const num = (flags: Args['flags'], name: string): number | undefined => {
  const raw = str(flags, name);
  return raw === undefined ? undefined : Number(raw);
};

async function write(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text, 'utf8');
}

/** `--fake`, else an endpoint, else the SDK with its own key. */
function clientFrom(flags: Args['flags']): JevClient {
  if (flags['fake'] === true) return fakeClient();
  const baseUrl = str(flags, 'base-url') ?? process.env['JEVIDENCE_BASE_URL'];
  if (baseUrl) {
    const options: Parameters<typeof httpClient>[0] = { baseUrl };
    const key = process.env['JEVIDENCE_API_KEY'];
    if (key) options.apiKey = key;
    const model = str(flags, 'model');
    if (model) options.model = model;
    return httpClient(options);
  }
  const model = str(flags, 'model');
  return sdkClient(model ? { defaultModel: model } : {});
}

async function readLabels(path: string): Promise<Label[]> {
  const text = (await readFile(path, 'utf8')).trim();
  if (!text) return [];
  const rows: unknown[] = text.startsWith('[')
    ? (JSON.parse(text) as unknown[])
    : text
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
  return rows.map((row, i) => {
    const parsed = LabelSchema.safeParse(row);
    if (!parsed.success) throw new Error(`label ${i + 1} does not validate: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    return parsed.data;
  });
}

const USAGE = `jevidence - measure an agent or a prompt with a panel of typed questions

  jevidence lint-panel <panel.json...>
  jevidence replay --panel <panel.json> --data <items.jsonl> [--out records.jsonl]
                   [--fake | --base-url <url>] [--model <id>] [--concurrency <n>]
                   [--node <name>] [--prompt-version <v>] [--run-id <id>]
  jevidence calibrate --records <records.jsonl> --labels <labels.json> [--panel <panel.json>]
                      [--target <precision>] [--min-samples <n>] [--out <report.md>] [--json <report.json>]
  jevidence report --records <records.jsonl> [--compare <from,to>] [--out <report.md>] [--json <report.json>]

Endpoint and key come from JEVIDENCE_BASE_URL and JEVIDENCE_API_KEY when the flags are absent;
with neither, the TypeSafe SDK is used with its own configuration.`;

export async function run(argv: string[], out: (line: string) => void = console.log): Promise<number> {
  const { command, positional, flags } = parseArgs(argv);

  if (command === 'help' || flags['help'] === true) {
    out(USAGE);
    return 0;
  }

  if (command === 'lint-panel') {
    const paths = positional.length > 0 ? positional : [str(flags, 'panel')].filter((p): p is string => Boolean(p));
    if (paths.length === 0) {
      out('lint-panel needs at least one panel file');
      return 2;
    }
    let worst = 0;
    for (const path of paths) {
      try {
        const panel = await loadPanel(path);
        const issues = lintPanel(panel);
        const errors = issues.filter((i) => i.severity === 'error');
        out(`${path} — ${panel.id}@${panel.version}, ${Object.keys(panel.questions).length} question(s), ${errors.length} error(s), ${issues.length - errors.length} warning(s)`);
        for (const issue of issues) out(`  ${issue.severity === 'error' ? 'error' : ' warn'} ${issue.questionId ?? '(panel)'} [${issue.rule}] ${issue.message}`);
        if (errors.length > 0) worst = 1;
      } catch (error) {
        out(`${path} — ${(error as Error).message}`);
        worst = 1;
      }
    }
    return worst;
  }

  if (command === 'replay') {
    const panelPath = str(flags, 'panel');
    const dataPath = str(flags, 'data') ?? positional[0];
    if (!panelPath || !dataPath) {
      out('replay needs --panel and --data');
      return 2;
    }
    const panel = await loadPanel(panelPath);
    const outPath = str(flags, 'out');
    const options: Parameters<typeof replay>[3] = {};
    if (outPath) options.ledger = jsonlLedger(outPath);
    const identity: { node?: string; promptVersion?: string; runId?: string } = {};
    const node = str(flags, 'node');
    const promptVersion = str(flags, 'prompt-version');
    const runId = str(flags, 'run-id');
    if (node) identity.node = node;
    if (promptVersion) identity.promptVersion = promptVersion;
    if (runId) identity.runId = runId;
    if (Object.keys(identity).length > 0) options.identity = identity;
    const concurrency = num(flags, 'concurrency');
    if (concurrency !== undefined) options.concurrency = concurrency;
    const model = str(flags, 'model');
    if (model) options.model = model;

    const result = await replay(panel, dataPath, clientFrom(flags), options);
    out(`${result.records.length} record(s), ${result.requests} request(s), ${result.inputTokens} input tokens, $${result.costUSD.toFixed(6)}`);
    for (const skip of result.skipped) out(`  skipped item ${skip.index}: ${skip.reason}`);
    if (outPath) out(`wrote ${outPath}`);
    else out(JSON.stringify(result.records, null, 2));
    return 0;
  }

  if (command === 'calibrate') {
    const recordsPath = str(flags, 'records');
    const labelsPath = str(flags, 'labels');
    if (!recordsPath || !labelsPath) {
      out('calibrate needs --records and --labels');
      return 2;
    }
    const records = await readRecords(recordsPath);
    const labels = await readLabels(labelsPath);
    const panelPath = str(flags, 'panel');
    const options: Parameters<typeof calibrate>[2] = {};
    if (panelPath) options.panel = await loadPanel(panelPath);
    const target = num(flags, 'target');
    if (target !== undefined) options.targetPrecision = target;
    const minSamples = num(flags, 'min-samples');
    if (minSamples !== undefined) options.minSamples = minSamples;

    const result = calibrate(records, labels, options);
    const markdown = calibrationMarkdown(result, str(flags, 'title') ?? `Calibration — ${options.panel?.id ?? recordsPath}`);
    const outPath = str(flags, 'out');
    const jsonPath = str(flags, 'json');
    if (outPath) await write(outPath, markdown);
    if (jsonPath) await write(jsonPath, `${JSON.stringify(result, null, 2)}\n`);
    if (!outPath && !jsonPath) out(markdown);
    else out(`${result.questions.length} question(s) graded${outPath ? `, wrote ${outPath}` : ''}${jsonPath ? `, wrote ${jsonPath}` : ''}`);
    return result.questions.some((q) => q.grade === 'drop') ? 1 : 0;
  }

  if (command === 'report') {
    const recordsPath = str(flags, 'records') ?? positional[0];
    if (!recordsPath) {
      out('report needs --records');
      return 2;
    }
    const records = await readRecords(recordsPath);
    const options: Parameters<typeof report>[1] = {};
    const compare = str(flags, 'compare');
    if (compare) {
      const [from, to] = compare.split(',');
      if (from && to) options.compare = [from, to];
    }
    const title = str(flags, 'title');
    if (title) options.title = title;
    const result = report(records, options);
    const outPath = str(flags, 'out');
    const jsonPath = str(flags, 'json');
    if (outPath) await write(outPath, result.markdown);
    if (jsonPath) await write(jsonPath, `${JSON.stringify({ groups: result.groups, drift: result.drift }, null, 2)}\n`);
    if (!outPath && !jsonPath) out(result.markdown);
    else out(`${result.groups.length} group(s)${outPath ? `, wrote ${outPath}` : ''}${jsonPath ? `, wrote ${jsonPath}` : ''}`);
    return 0;
  }

  out(`unknown command "${command}"\n\n${USAGE}`);
  return 2;
}

const invokedDirectly = process.argv[1] !== undefined && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error((error as Error).message);
      process.exitCode = 1;
    });
}
