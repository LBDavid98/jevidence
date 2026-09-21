// The same panel over output that has already been produced. No node runs, so comparing prompt
// v1 with prompt v2 costs what the judge costs and nothing else.
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { JevClient } from './client.js';
import type { Ledger } from './ledger.js';
import { asJson, defaultOutputText, runPanel } from './measure.js';
import { decide, type Policy } from './policy.js';
import type { SentenceOptions } from './segment.js';
import type { BudgetLimits } from './budget.js';
import type { Identity, JevRecord, JevState, JsonValue, Panel } from './types.js';

/** One recorded turn to re-judge. A stored Record works too, as long as it carries its output. */
export interface ReplayItem {
  id?: string;
  node?: string;
  promptVersion?: string;
  runId?: string;
  input?: JsonValue;
  output?: JsonValue;
  meta?: JsonValue;
  /** Skip the panel's state mode and judge this exactly. */
  state?: JevState;
}

export interface ReplayOptions {
  client: JevClient;
  ledger?: Ledger;
  identity?: Partial<Identity>;
  /** Replay observes by default; a policy only changes the decision written to the record. */
  policy?: Policy;
  budget?: BudgetLimits;
  model?: string;
  sentence?: SentenceOptions;
  /** Items judged at once. Default 1, which keeps the order and the rate limit obvious. */
  concurrency?: number;
  /** Called as each record lands, for a progress line. */
  onRecord?: (record: JevRecord, index: number) => void | Promise<void>;
  now?: () => Date;
  newId?: () => string;
}

export interface ReplayResult {
  records: JevRecord[];
  costUSD: number;
  inputTokens: number;
  requests: number;
  /** Items the panel could not be run against, with the reason. */
  skipped: Array<{ index: number; reason: string }>;
}

/** Read a dataset: one JSON object per line, or a JSON array. */
export async function readDataset(path: string): Promise<ReplayItem[]> {
  const text = (await readFile(path, 'utf8')).trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text) as ReplayItem[];
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ReplayItem);
}

function stateFor(panel: Panel, item: ReplayItem): JevState {
  if (item.state !== undefined) return item.state;
  const meta = item.meta;
  if (typeof panel.state === 'function') return panel.state({ input: item.input, output: item.output, ...(meta !== undefined ? { meta } : {}) });
  if (panel.state === 'output') return { output: asJson(item.output), ...(meta !== undefined ? { meta } : {}) };
  return { input: asJson(item.input), output: asJson(item.output), ...(meta !== undefined ? { meta } : {}) };
}

/** Run `panel` over recorded items, writing one record each. */
export async function replay(panel: Panel, source: ReplayItem[] | JevRecord[] | string, client: JevClient, options: Omit<ReplayOptions, 'client'> = {}): Promise<ReplayResult> {
  const items: ReplayItem[] = typeof source === 'string' ? await readDataset(source) : (source as ReplayItem[]);
  const { ledger, identity, policy, budget, model, sentence, concurrency = 1, now = () => new Date(), newId = () => randomUUID() } = options;

  const records: Array<JevRecord | undefined> = new Array(items.length);
  const skipped: ReplayResult['skipped'] = [];
  let costUSD = 0;
  let inputTokens = 0;
  let requests = 0;
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor++;
      const item = items[index];
      if (item === undefined) return;
      if (item.output === undefined && item.state === undefined) {
        skipped.push({ index, reason: 'the item carries neither an output nor a state to judge' });
        continue;
      }
      const state = stateFor(panel, item);
      const runOptions: Parameters<typeof runPanel>[2] = { client, text: item.output !== undefined ? defaultOutputText(item.output) : undefined };
      if (budget !== undefined) runOptions.budget = budget;
      if (model !== undefined) runOptions.model = model;
      if (sentence !== undefined) runOptions.sentence = sentence;
      const run = await runPanel(panel, state, runOptions);
      const outcome = decide(panel, run.judgments, policy);

      const record: JevRecord = {
        id: item.id ?? newId(),
        ts: now().toISOString(),
        node: item.node ?? identity?.node ?? panel.id,
        promptVersion: item.promptVersion ?? identity?.promptVersion ?? 'replay',
        stateHash: run.stateHash,
        model: run.model,
        latencyMs: run.latencyMs,
        inputTokens: run.inputTokens,
        costUSD: run.costUSD,
        judgments: run.judgments,
        decision: outcome.decision,
        panelId: panel.id,
        panelVersion: panel.version,
      };
      const runId = item.runId ?? identity?.runId;
      if (runId !== undefined) record.runId = runId;

      records[index] = record;
      costUSD += run.costUSD;
      inputTokens += run.inputTokens;
      requests += run.requests;
      await ledger?.append(record);
      await options.onRecord?.(record, index);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, worker));
  return { records: records.filter((r): r is JevRecord => r !== undefined), costUSD, inputTokens, requests, skipped };
}
