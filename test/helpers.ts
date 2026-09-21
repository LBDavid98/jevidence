import { parsePanel } from '../src/core/panel.js';
import type { JevRecord, Judgment, Panel } from '../src/core/types.js';

/** A two-question sentence panel whose answers the fake client can be steered into. */
export const sentencePanel = (): Panel =>
  parsePanel({
    id: 'test-sentences',
    version: '1',
    segment: 'sentence',
    state: 'input+output',
    questions: {
      'has-widget': { type: 'noul', instructions: 'This sentence mentions the widget. jev:contains=widget', threshold: 0.5, severity: 'hard' },
      'always-low': { type: 'noul', instructions: 'This sentence is suspicious in some way. jev:p=0.10', threshold: 0.5, severity: 'advisory' },
    },
  });

export const unitPanel = (): Panel =>
  parsePanel({
    id: 'test-unit',
    version: '1',
    segment: 'none',
    state: 'output',
    questions: {
      problem: { type: 'noul', instructions: 'The answer has a problem worth naming. jev:p=0.90', threshold: 0.5, severity: 'hard' },
    },
  });

export const record = (over: Partial<JevRecord> = {}): JevRecord => ({
  id: over.id ?? 'r1',
  ts: over.ts ?? '2026-09-21T00:00:00.000Z',
  node: over.node ?? 'writer',
  promptVersion: over.promptVersion ?? 'v1',
  stateHash: over.stateHash ?? 'hash-1',
  model: over.model ?? 'jev-1.13.0',
  latencyMs: over.latencyMs ?? 100,
  inputTokens: over.inputTokens ?? 1000,
  costUSD: over.costUSD ?? 0.000042,
  judgments: over.judgments ?? [],
  decision: over.decision ?? 'pass',
  ...over,
});

export const judgment = (over: Partial<Judgment> & { questionId: string }): Judgment => ({
  type: 'noul',
  answer: 0.5,
  ...over,
});
