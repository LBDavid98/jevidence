import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fakeClient } from '../src/core/client.js';
import { hashState } from '../src/core/hash.js';
import { memoryLedger } from '../src/core/ledger.js';
import { readDataset, replay } from '../src/core/replay.js';
import { sentencePanel, unitPanel } from './helpers.js';

const items = [
  { id: 'one', node: 'writer', promptVersion: 'v1', input: 'a brief', output: 'We build a widget for invoicing. Nothing here mentions it.' },
  { id: 'two', node: 'writer', promptVersion: 'v1', input: 'a brief', output: 'Two sentences with no mention. A second sentence with none either.' },
];

describe('replay', () => {
  it('runs the panel over stored output without a node', async () => {
    const client = fakeClient();
    const result = await replay(sentencePanel(), items, client);
    expect(result.records).toHaveLength(2);
    expect(result.records[0]?.id).toBe('one');
    expect(result.records[0]?.judgments).toHaveLength(4);
    expect(result.records[0]?.panelVersion).toBe('1');
    expect(result.requests).toBe(2);
    expect(result.inputTokens).toBeGreaterThan(0);
  });

  it('reproduces a ledger a caller can query', async () => {
    const ledger = memoryLedger();
    await replay(sentencePanel(), items, fakeClient(), { ledger });
    expect(await ledger.query({ node: 'writer' })).toHaveLength(2);
  });

  it('gives the same answers twice, so two prompt versions are comparable', async () => {
    const first = await replay(sentencePanel(), items, fakeClient());
    const second = await replay(sentencePanel(), items, fakeClient());
    expect(first.records.map((r) => r.judgments.map((j) => j.answer))).toEqual(second.records.map((r) => r.judgments.map((j) => j.answer)));
    expect(first.records[0]?.stateHash).toBe(hashState({ input: 'a brief', output: items[0]!.output }));
  });

  it('reads a dataset from a jsonl file and from a JSON array', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jevidence-replay-'));
    const lines = join(dir, 'items.jsonl');
    const array = join(dir, 'items.json');
    await writeFile(lines, `${items.map((i) => JSON.stringify(i)).join('\n')}\n`, 'utf8');
    await writeFile(array, JSON.stringify(items), 'utf8');
    expect(await readDataset(lines)).toHaveLength(2);
    expect(await readDataset(array)).toHaveLength(2);
    const result = await replay(sentencePanel(), lines, fakeClient(), { identity: { node: 'replayed', promptVersion: 'v2' } });
    expect(result.records).toHaveLength(2);
    expect(result.records.every((r) => r.node === 'writer')).toBe(true);
  });

  it('falls back to the identity for an item that names no node', async () => {
    const result = await replay(unitPanel(), [{ output: 'anything at all' }], fakeClient(), { identity: { node: 'fallback', promptVersion: 'v9' } });
    expect(result.records[0]?.node).toBe('fallback');
    expect(result.records[0]?.promptVersion).toBe('v9');
  });

  it('names what it could not judge instead of judging nothing', async () => {
    const result = await replay(unitPanel(), [{ id: 'empty' }, { id: 'ok', output: 'something to judge here' }], fakeClient());
    expect(result.records).toHaveLength(1);
    expect(result.skipped).toEqual([{ index: 0, reason: 'the item carries neither an output nor a state to judge' }]);
  });

  it('judges several items at once when asked', async () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `i${i}`, output: `Item number ${i} has a sentence in it.` }));
    const result = await replay(unitPanel(), many, fakeClient(), { concurrency: 3 });
    expect(result.records.map((r) => r.id)).toEqual(many.map((m) => m.id));
  });
});
