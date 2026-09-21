import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseArgs, run } from '../src/cli.js';
import { writeRecords } from '../src/core/ledger.js';
import { judgment, record } from './helpers.js';
import type { Label } from '../src/core/types.js';

const dir = () => mkdtemp(join(tmpdir(), 'jevidence-cli-'));
const collect = () => {
  const lines: string[] = [];
  return { lines, out: (line: string) => void lines.push(line), text: () => lines.join('\n') };
};

const panel = {
  id: 'cli-panel',
  version: '1',
  segment: 'sentence',
  state: 'input+output',
  questions: { cited: { type: 'noul', instructions: 'This sentence states a figure with no marker. jev:p=0.80', threshold: 0.5 } },
};

describe('parseArgs', () => {
  it('reads a command, flags with values, flags without, and positionals', () => {
    const args = parseArgs(['replay', 'file.jsonl', '--panel', 'p.json', '--fake', '--concurrency=4']);
    expect(args.command).toBe('replay');
    expect(args.positional).toEqual(['file.jsonl']);
    expect(args.flags).toEqual({ panel: 'p.json', fake: true, concurrency: '4' });
  });
});

describe('jevidence lint-panel', () => {
  it('passes a clean panel and prints what it found', async () => {
    const path = join(await dir(), 'panel.json');
    await writeFile(path, JSON.stringify(panel), 'utf8');
    const sink = collect();
    expect(await run(['lint-panel', path], sink.out)).toBe(0);
    expect(sink.text()).toContain('cli-panel@1');
    expect(sink.text()).toContain('0 error(s)');
  });

  it('fails a compound noul', async () => {
    const path = join(await dir(), 'bad.json');
    await writeFile(path, JSON.stringify({ ...panel, questions: { both: { type: 'noul', instructions: 'This gives a figure and omits the marker.' } } }), 'utf8');
    const sink = collect();
    expect(await run(['lint-panel', path], sink.out)).toBe(1);
    expect(sink.text()).toContain('noul-one-condition');
  });

  it('lints every panel this package ships', async () => {
    const sink = collect();
    const code = await run(['lint-panel', 'panels/seo-review.json', 'panels/brief-check.json', 'panels/generic-quality.json'], sink.out);
    expect(code).toBe(0);
    expect(sink.text()).toContain('brief-check@1');
  });

  it('says so when there is nothing to lint', async () => {
    const sink = collect();
    expect(await run(['lint-panel'], sink.out)).toBe(2);
  });
});

describe('jevidence replay', () => {
  it('judges a dataset with the fake client and writes a ledger', async () => {
    const base = await dir();
    const panelPath = join(base, 'panel.json');
    const dataPath = join(base, 'items.jsonl');
    const outPath = join(base, 'records.jsonl');
    await writeFile(panelPath, JSON.stringify(panel), 'utf8');
    await writeFile(dataPath, `${JSON.stringify({ id: 'x', node: 'writer', promptVersion: 'v1', input: 'brief', output: 'Revenue rose by twelve percent last year. Nobody checked the source.' })}\n`, 'utf8');

    const sink = collect();
    expect(await run(['replay', '--panel', panelPath, '--data', dataPath, '--out', outPath, '--fake'], sink.out)).toBe(0);
    expect(sink.text()).toContain('1 record(s)');
    const written = (await readFile(outPath, 'utf8')).trim().split('\n');
    expect(written).toHaveLength(1);
    expect(JSON.parse(written[0]!).judgments).toHaveLength(2);
  });

  it('needs a panel and a dataset', async () => {
    const sink = collect();
    expect(await run(['replay', '--fake'], sink.out)).toBe(2);
  });
});

describe('jevidence calibrate', () => {
  it('writes a graded markdown report', async () => {
    const base = await dir();
    const recordsPath = join(base, 'records.jsonl');
    const labelsPath = join(base, 'labels.json');
    const outPath = join(base, 'calibration.md');
    const jsonPath = join(base, 'calibration.json');

    const judgments = Array.from({ length: 12 }, (_, i) => judgment({ questionId: 'cited', segmentIndex: i, answer: i < 6 ? 0.95 : 0.05 }));
    await writeRecords(recordsPath, [record({ node: 'writer', stateHash: 'h1', judgments })]);
    const labels: Label[] = Array.from({ length: 12 }, (_, i) => ({ node: 'writer', stateHash: 'h1', questionId: 'cited', segmentIndex: i, truth: i < 6, source: 'reviewer' }));
    await writeFile(labelsPath, JSON.stringify(labels), 'utf8');

    const sink = collect();
    expect(await run(['calibrate', '--records', recordsPath, '--labels', labelsPath, '--out', outPath, '--json', jsonPath], sink.out)).toBe(0);
    expect(await readFile(outPath, 'utf8')).toContain('trust');
    expect(JSON.parse(await readFile(jsonPath, 'utf8')).questions[0].grade).toBe('trust');
  });

  it('exits non-zero when a question is graded drop', async () => {
    const base = await dir();
    const recordsPath = join(base, 'records.jsonl');
    const labelsPath = join(base, 'labels.json');
    const judgments = Array.from({ length: 12 }, (_, i) => judgment({ questionId: 'cited', segmentIndex: i, answer: 0.95 }));
    await writeRecords(recordsPath, [record({ node: 'writer', stateHash: 'h1', judgments })]);
    const labels: Label[] = Array.from({ length: 12 }, (_, i) => ({ node: 'writer', stateHash: 'h1', questionId: 'cited', segmentIndex: i, truth: i === 0, source: 'reviewer' }));
    await writeFile(labelsPath, JSON.stringify(labels), 'utf8');
    const sink = collect();
    expect(await run(['calibrate', '--records', recordsPath, '--labels', labelsPath], sink.out)).toBe(1);
  });

  it('needs records and labels', async () => {
    const sink = collect();
    expect(await run(['calibrate'], sink.out)).toBe(2);
  });
});

describe('jevidence report', () => {
  it('prints the report when no file is asked for', async () => {
    const path = join(await dir(), 'records.jsonl');
    await writeRecords(path, [record({ promptVersion: 'v1', judgments: [judgment({ questionId: 'cited', answer: 0.9, flagged: true })] })]);
    const sink = collect();
    expect(await run(['report', '--records', path], sink.out)).toBe(0);
    expect(sink.text()).toContain('| node | prompt |');
  });

  it('writes markdown and JSON where it is told', async () => {
    const base = await dir();
    const path = join(base, 'records.jsonl');
    const outPath = join(base, 'report.md');
    const jsonPath = join(base, 'report.json');
    await writeRecords(path, [record({ promptVersion: 'v1' }), record({ id: 'b', promptVersion: 'v2' })]);
    const sink = collect();
    expect(await run(['report', '--records', path, '--out', outPath, '--json', jsonPath, '--compare', 'v1,v2'], sink.out)).toBe(0);
    expect(await readFile(outPath, 'utf8')).toContain('Drift');
    expect(JSON.parse(await readFile(jsonPath, 'utf8')).groups).toHaveLength(2);
  });
});

describe('the rest of the CLI', () => {
  it('prints usage, and refuses a verb it does not have', async () => {
    const help = collect();
    expect(await run([], help.out)).toBe(0);
    expect(help.text()).toContain('jevidence replay');
    const bad = collect();
    expect(await run(['frobnicate'], bad.out)).toBe(2);
    expect(bad.text()).toContain('unknown command');
  });
});
