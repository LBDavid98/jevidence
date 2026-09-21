// Where records go. Two ship: memory for tests, JSONL for a file you can read with `jq`.
// A consumer with a database implements the interface; nothing here is a base class.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { Decision, JevRecord } from './types.js';
import { RecordSchema } from './types.js';

export interface LedgerQuery {
  node?: string | string[];
  promptVersion?: string | string[];
  runId?: string;
  decision?: Decision | Decision[];
  panelId?: string;
  /** ISO timestamps, inclusive. */
  since?: string;
  until?: string;
  limit?: number;
}

/** Append-only. `query` is the only read Jevidence itself needs. */
export interface Ledger {
  append(record: JevRecord): Promise<void>;
  query(query?: LedgerQuery): Promise<JevRecord[]>;
}

const oneOf = (value: string | undefined, want: string | string[] | undefined): boolean => {
  if (want === undefined) return true;
  return Array.isArray(want) ? want.includes(value ?? '') : want === value;
};

export function matchesQuery(record: JevRecord, query: LedgerQuery = {}): boolean {
  if (!oneOf(record.node, query.node)) return false;
  if (!oneOf(record.promptVersion, query.promptVersion)) return false;
  if (!oneOf(record.decision, query.decision)) return false;
  if (query.runId !== undefined && record.runId !== query.runId) return false;
  if (query.panelId !== undefined && record.panelId !== query.panelId) return false;
  if (query.since !== undefined && record.ts < query.since) return false;
  if (query.until !== undefined && record.ts > query.until) return false;
  return true;
}

export function filterRecords(records: JevRecord[], query: LedgerQuery = {}): JevRecord[] {
  const out = records.filter((r) => matchesQuery(r, query));
  return query.limit !== undefined ? out.slice(0, query.limit) : out;
}

export interface MemoryLedger extends Ledger {
  /** The records as appended, in order. */
  readonly records: JevRecord[];
  clear(): void;
}

export function memoryLedger(seed: JevRecord[] = []): MemoryLedger {
  const records: JevRecord[] = [...seed];
  return {
    records,
    async append(record) {
      records.push(record);
    },
    async query(query) {
      return filterRecords(records, query);
    },
    clear() {
      records.length = 0;
    },
  };
}

/** One JSON object per line. Parses a JSON array too, so a hand-written file works. */
export function parseRecords(text: string): JevRecord[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const rows: unknown[] = trimmed.startsWith('[')
    ? (JSON.parse(trimmed) as unknown[])
    : trimmed
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line) as unknown);
  return rows.map((row, i) => {
    const parsed = RecordSchema.safeParse(row);
    if (!parsed.success) throw new Error(`record ${i + 1} does not validate: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
    return parsed.data;
  });
}

export async function readRecords(path: string): Promise<JevRecord[]> {
  try {
    return parseRecords(await readFile(path, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export async function writeRecords(path: string, records: JevRecord[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');
}

export function jsonlLedger(path: string): Ledger {
  let ready: Promise<void> | undefined;
  const ensure = () => (ready ??= mkdir(dirname(path), { recursive: true }).then(() => undefined));
  return {
    async append(record) {
      await ensure();
      await appendFile(path, `${JSON.stringify(record)}\n`, 'utf8');
    },
    async query(query) {
      return filterRecords(await readRecords(path), query);
    },
  };
}
