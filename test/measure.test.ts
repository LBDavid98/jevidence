import { describe, expect, it, vi } from 'vitest';
import { fakeClient, type JevClient } from '../src/core/client.js';
import { hashState } from '../src/core/hash.js';
import { memoryLedger } from '../src/core/ledger.js';
import { Blocked, asJson, defaultOutputText, measure, runPanel, thresholdsOf } from '../src/core/measure.js';
import { parsePanel } from '../src/core/panel.js';
import { escalate, type Policy } from '../src/core/policy.js';
import { sentencePanel, unitPanel } from './helpers.js';
import type { Judgment } from '../src/core/types.js';

const TEXT = 'We build a widget for invoicing. The second sentence says nothing about it. A widget appears here again.';

describe('runPanel', () => {
  it('asks every question about every segment in one request when it fits', async () => {
    const client = fakeClient();
    const run = await runPanel(sentencePanel(), { input: 'a brief', output: TEXT }, { client });
    expect(run.segments).toHaveLength(3);
    expect(run.judgments).toHaveLength(6);
    expect(client.calls).toHaveLength(1);
    expect(Object.keys(client.calls[0]?.questions ?? {})).toEqual(['has-widget#0', 'has-widget#1', 'has-widget#2', 'always-low#0', 'always-low#1', 'always-low#2']);
  });

  it('hangs a verbatim span on every segmented judgment', async () => {
    const run = await runPanel(sentencePanel(), { input: 'a brief', output: TEXT }, { client: fakeClient() });
    for (const judgment of run.judgments) {
      expect(judgment.span).toBeDefined();
      // The span starts where the detectors start it, which for a later sentence is the space
      // in front of it; the text itself is trimmed.
      expect(TEXT.slice(judgment.span?.start ?? 0).trimStart()).toContain(judgment.span?.text ?? '');
    }
    const exact = await runPanel(sentencePanel(), { input: 'a brief', output: TEXT }, { client: fakeClient(), sentence: { trimOffsets: true } });
    for (const judgment of exact.judgments) {
      expect(TEXT.slice(judgment.span?.start ?? 0, judgment.span?.end ?? 0)).toBe(judgment.span?.text);
    }
    const first = run.judgments.find((j) => j.questionId === 'has-widget' && j.segmentIndex === 0);
    expect(first?.answer).toBe(0.95);
    expect(first?.flagged).toBe(true);
    const second = run.judgments.find((j) => j.questionId === 'has-widget' && j.segmentIndex === 1);
    expect(second?.answer).toBe(0.02);
    expect(second?.flagged).toBe(false);
  });

  it('cuts one unit into several requests under the token budget', async () => {
    const client = fakeClient();
    const long = Array.from({ length: 20 }, (_, i) => `Sentence number ${i} is long enough to count as a sentence.`).join(' ');
    const run = await runPanel(sentencePanel(), { output: long }, { client, budget: { maxRequestTokens: 900, maxStateTokens: 4000 } });
    expect(run.segments).toHaveLength(20);
    expect(run.judgments).toHaveLength(40);
    expect(run.requests).toBeGreaterThan(1);
    expect(client.calls.length).toBe(run.requests);
    const asked = client.calls.flatMap((call) => Object.keys(call.questions));
    expect(new Set(asked).size).toBe(40);
  });

  it('asks a unit question once, however many segments there are', async () => {
    const panel = parsePanel({
      id: 'mixed',
      version: '1',
      segment: 'sentence',
      state: 'output',
      questions: {
        'per-sentence': { type: 'noul', instructions: 'This sentence mentions a widget. jev:contains=widget' },
        'per-unit': { type: 'noul', instructions: 'The section as a whole is off. jev:p=0.80', per: 'unit' },
      },
    });
    const run = await runPanel(panel, { output: TEXT }, { client: fakeClient() });
    const unitJudgments = run.judgments.filter((j) => j.questionId === 'per-unit');
    expect(unitJudgments).toHaveLength(1);
    expect(unitJudgments[0]?.segmentIndex).toBeUndefined();
    expect(unitJudgments[0]?.answer).toBe(0.8);
    expect(run.judgments.filter((j) => j.questionId === 'per-sentence')).toHaveLength(3);
  });

  it('refuses to lose a question the judge did not answer', async () => {
    const partial: JevClient = {
      async judge(_state, questions) {
        const ids = Object.keys(questions).slice(1);
        const answers: Record<string, { type: 'noul'; noul: number }> = {};
        for (const id of ids) answers[id] = { type: 'noul', noul: 0.1 };
        return { answers, model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 0 }, costUSD: 0, latencyMs: 1 };
      },
    };
    await expect(runPanel(sentencePanel(), { output: TEXT }, { client: partial })).rejects.toThrow(/nothing answered for/);
  });

  it('hashes the state it judged', async () => {
    const state = { input: 'a brief', output: TEXT };
    const run = await runPanel(sentencePanel(), state, { client: fakeClient() });
    expect(run.stateHash).toBe(hashState(state));
  });
});

describe('measure', () => {
  const node = async (brief: string) => `We build a widget for ${brief}. The second sentence says nothing about it.`;

  it('returns the node result unchanged and records one row', async () => {
    const ledger = memoryLedger();
    const wrapped = measure(node, sentencePanel(), { client: fakeClient(), ledger, identity: { node: 'writer', promptVersion: 'v1', runId: 'run-7' } });
    const result = await wrapped('invoicing');
    expect(result).toBe(await node('invoicing'));
    expect(ledger.records).toHaveLength(1);
    const record = ledger.records[0]!;
    expect(record.node).toBe('writer');
    expect(record.promptVersion).toBe('v1');
    expect(record.runId).toBe('run-7');
    expect(record.panelId).toBe('test-sentences');
    expect(record.judgments).toHaveLength(4);
    expect(record.decision).toBe('flag');
    expect(record.inputTokens).toBeGreaterThan(0);
    expect(record.nodeLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('runs the node once when nothing asks for a retry', async () => {
    const spy = vi.fn(node);
    const wrapped = measure(spy, sentencePanel(), { client: fakeClient(), identity: { node: 'writer', promptVersion: 'v1' } });
    await wrapped('invoicing');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('observes only when no policy is given', async () => {
    const ledger = memoryLedger();
    const wrapped = measure(async () => 'The answer has a problem worth naming.', unitPanel(), { client: fakeClient(), ledger, identity: { node: 'n', promptVersion: 'v1' } });
    await expect(wrapped()).resolves.toContain('problem');
    expect(ledger.records[0]?.decision).toBe('flag');
  });

  it('hands the flagged judgments to an escalation handler', async () => {
    const seen: Judgment[][] = [];
    const policy = escalate<[string]>((context) => {
      seen.push(context.flagged);
      expect(context.node).toBe('writer');
      expect(context.state).toHaveProperty('output');
    });
    const wrapped = measure(node, sentencePanel(), { client: fakeClient(), identity: { node: 'writer', promptVersion: 'v1' }, policy });
    await wrapped('invoicing');
    expect(seen[0]?.length).toBeGreaterThan(0);
    expect(seen[0]?.every((j) => j.flagged)).toBe(true);
  });

  it('re-runs the node with the flagged judgments appended, up to maxRetries', async () => {
    const calls: string[] = [];
    const retryNode = async (brief: string) => {
      calls.push(brief);
      return `We build a widget for ${brief}.`;
    };
    const policy: Policy<[string]> = { action: 'retry', maxRetries: 2 };
    const ledger = memoryLedger();
    const wrapped = measure(retryNode, sentencePanel(), { client: fakeClient(), ledger, identity: { node: 'writer', promptVersion: 'v1' }, policy });
    await wrapped('invoicing');
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain('Fix these before answering again');
    expect(ledger.records).toHaveLength(3);
    expect(ledger.records.at(-1)?.decision).toBe('flag');
  });

  it('throws Blocked, with the record already written', async () => {
    const ledger = memoryLedger();
    const policy: Policy<[string]> = { action: 'block' };
    const wrapped = measure(node, sentencePanel(), { client: fakeClient(), ledger, identity: { node: 'writer', promptVersion: 'v1' }, policy });
    await expect(wrapped('invoicing')).rejects.toBeInstanceOf(Blocked);
    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0]?.decision).toBe('block');
  });

  it('records a judge that failed without breaking the node', async () => {
    const ledger = memoryLedger();
    const wrapped = measure(async () => 'the state says jev:error=529 somewhere', unitPanel(), { client: fakeClient(), ledger, identity: { node: 'n', promptVersion: 'v1' } });
    await expect(wrapped()).resolves.toContain('529');
    expect(ledger.records[0]?.error).toContain('overload');
    expect(ledger.records[0]?.judgments).toHaveLength(0);
    expect(ledger.records[0]?.decision).toBe('pass');
  });

  it('rethrows the judge error when told not to tolerate it', async () => {
    const wrapped = measure(async () => 'the state says jev:error=401 somewhere', unitPanel(), {
      client: fakeClient(),
      identity: { node: 'n', promptVersion: 'v1' },
      tolerateJudgeErrors: false,
    });
    await expect(wrapped()).rejects.toThrow();
  });

  it('builds the state the panel asks for, and takes an override', async () => {
    const client = fakeClient();
    const wrapped = measure(node, unitPanel(), { client, identity: { node: 'n', promptVersion: 'v1' } });
    await wrapped('invoicing');
    expect(client.calls[0]?.state).toEqual({ output: await node('invoicing') });

    const custom = fakeClient();
    const withBuilder = measure(node, unitPanel(), {
      client: custom,
      identity: { node: 'n', promptVersion: 'v1' },
      buildState: ({ input, output }) => ({ brief: input[0], text: output }),
    });
    await withBuilder('invoicing');
    expect(custom.calls[0]?.state).toEqual({ brief: 'invoicing', text: await node('invoicing') });
  });

  it('carries meta into the state', async () => {
    const client = fakeClient();
    const wrapped = measure(node, sentencePanel(), { client, identity: { node: 'n', promptVersion: 'v1' }, meta: { keyword: 'invoicing' } });
    await wrapped('invoicing');
    expect(client.calls[0]?.state).toHaveProperty('meta', { keyword: 'invoicing' });
  });
});

describe('the small helpers', () => {
  it('turns anything into JSON', () => {
    expect(asJson(undefined)).toBeNull();
    expect(asJson({ a: 1 })).toEqual({ a: 1 });
    expect(asJson(() => 1)).toBeNull();
  });

  it('finds the text a panel segments', () => {
    expect(defaultOutputText('plain')).toBe('plain');
    expect(defaultOutputText({ text: 'inner' })).toBe('inner');
    expect(defaultOutputText({ a: 1 })).toBe('{"a":1}');
  });

  it('lists the thresholds a panel measures against', () => {
    expect(thresholdsOf(sentencePanel())).toEqual({ 'has-widget': 0.5, 'always-low': 0.5 });
  });
});
