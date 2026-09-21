import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { filterRecords, jsonlLedger, matchesQuery, memoryLedger, parseRecords, readRecords, writeRecords } from '../src/core/ledger.js';
import { record } from './helpers.js';

const dir = () => mkdtemp(join(tmpdir(), 'jevidence-ledger-'));

describe('memoryLedger', () => {
  it('keeps what it is given, in order', async () => {
    const ledger = memoryLedger();
    await ledger.append(record({ id: 'a' }));
    await ledger.append(record({ id: 'b', promptVersion: 'v2' }));
    expect((await ledger.query()).map((r) => r.id)).toEqual(['a', 'b']);
    expect((await ledger.query({ promptVersion: 'v2' })).map((r) => r.id)).toEqual(['b']);
    ledger.clear();
    expect(await ledger.query()).toHaveLength(0);
  });

  it('starts from records it is seeded with', async () => {
    const ledger = memoryLedger([record({ id: 'seed' })]);
    expect(await ledger.query()).toHaveLength(1);
  });
});

describe('queries', () => {
  const rows = [
    record({ id: 'a', node: 'writer', promptVersion: 'v1', decision: 'pass', ts: '2026-09-01T00:00:00.000Z' }),
    record({ id: 'b', node: 'editor', promptVersion: 'v2', decision: 'flag', ts: '2026-09-10T00:00:00.000Z', runId: 'r1' }),
    record({ id: 'c', node: 'writer', promptVersion: 'v2', decision: 'block', ts: '2026-09-20T00:00:00.000Z' }),
  ];

  it('filters on each field', () => {
    expect(filterRecords(rows, { node: 'writer' }).map((r) => r.id)).toEqual(['a', 'c']);
    expect(filterRecords(rows, { node: ['editor', 'writer'], promptVersion: 'v2' }).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterRecords(rows, { decision: ['flag', 'block'] }).map((r) => r.id)).toEqual(['b', 'c']);
    expect(filterRecords(rows, { runId: 'r1' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRecords(rows, { since: '2026-09-05T00:00:00.000Z', until: '2026-09-15T00:00:00.000Z' }).map((r) => r.id)).toEqual(['b']);
    expect(filterRecords(rows, { limit: 2 })).toHaveLength(2);
    expect(matchesQuery(rows[0]!, {})).toBe(true);
  });
});

describe('jsonlLedger', () => {
  it('appends one line per record and reads them back', async () => {
    const path = join(await dir(), 'nested', 'records.jsonl');
    const ledger = jsonlLedger(path);
    await ledger.append(record({ id: 'a' }));
    await ledger.append(record({ id: 'b', node: 'editor' }));
    expect((await readFile(path, 'utf8')).trim().split('\n')).toHaveLength(2);
    expect((await ledger.query({ node: 'editor' })).map((r) => r.id)).toEqual(['b']);
  });

  it('reads an empty answer from a file that is not there yet', async () => {
    expect(await readRecords(join(await dir(), 'missing.jsonl'))).toEqual([]);
    expect(await jsonlLedger(join(await dir(), 'missing.jsonl')).query()).toEqual([]);
  });

  it('parses a JSON array as well as lines', () => {
    expect(parseRecords(JSON.stringify([record({ id: 'a' })]))).toHaveLength(1);
    expect(parseRecords('')).toEqual([]);
    expect(() => parseRecords(JSON.stringify([{ id: 'a' }]))).toThrow(/does not validate/);
  });

  it('writes a whole file at once', async () => {
    const path = join(await dir(), 'out.jsonl');
    await writeRecords(path, [record({ id: 'a' }), record({ id: 'b' })]);
    expect((await readRecords(path)).map((r) => r.id)).toEqual(['a', 'b']);
  });
});
