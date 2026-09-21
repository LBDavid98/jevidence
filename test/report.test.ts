import { describe, expect, it } from 'vitest';
import { report, reportMarkdown } from '../src/core/report.js';
import { judgment, record } from './helpers.js';
import type { JevRecord } from '../src/core/types.js';

const v1: JevRecord[] = [
  record({ id: 'a', promptVersion: 'v1', costUSD: 0.001, latencyMs: 100, nodeLatencyMs: 900, inputTokens: 1000, decision: 'flag', judgments: [judgment({ questionId: 'cited', answer: 0.9, flagged: true }), judgment({ questionId: 'jargon', answer: 0.2, flagged: false })] }),
  record({ id: 'b', promptVersion: 'v1', costUSD: 0.002, latencyMs: 300, nodeLatencyMs: 1100, inputTokens: 2000, decision: 'pass', judgments: [judgment({ questionId: 'cited', answer: 0.1, flagged: false }), judgment({ questionId: 'jargon', answer: 0.1, flagged: false })] }),
];
const v2: JevRecord[] = [
  record({ id: 'c', promptVersion: 'v2', costUSD: 0.0015, latencyMs: 200, nodeLatencyMs: 800, inputTokens: 1500, decision: 'pass', judgments: [judgment({ questionId: 'cited', answer: 0.1, flagged: false }), judgment({ questionId: 'jargon', answer: 0.05, flagged: false })] }),
  record({ id: 'd', promptVersion: 'v2', costUSD: 0.0015, latencyMs: 200, nodeLatencyMs: 800, inputTokens: 1500, decision: 'pass', judgments: [judgment({ questionId: 'cited', answer: 0.2, flagged: false }), judgment({ questionId: 'jargon', answer: 0.05, flagged: false })] }),
];

describe('report', () => {
  it('groups by node and prompt version', () => {
    const result = report([...v1, ...v2]);
    expect(result.groups.map((g) => g.promptVersion)).toEqual(['v1', 'v2']);
    const first = result.groups[0]!;
    expect(first.records).toBe(2);
    expect(first.judgments).toBe(4);
    expect(first.costUSD).toBeCloseTo(0.003, 10);
    expect(first.costPerRecord).toBeCloseTo(0.0015, 10);
    expect(first.inputTokens).toBe(3000);
    expect(first.decisions).toEqual({ flag: 1, pass: 1 });
  });

  it('describes the distribution of each question', () => {
    const cited = report(v1).groups[0]?.questions.find((q) => q.questionId === 'cited');
    expect(cited?.n).toBe(2);
    expect(cited?.flagged).toBe(1);
    expect(cited?.flaggedRate).toBe(0.5);
    expect(cited?.mean).toBeCloseTo(0.5, 10);
    expect(cited?.histogram?.[9]).toBe(1);
    expect(cited?.histogram?.[1]).toBe(1);
  });

  it('counts the choices a choice question made', () => {
    const records = [record({ judgments: [judgment({ questionId: 'tense', type: 'choice', answer: 'past' }), judgment({ questionId: 'tense', type: 'choice', answer: 'past' })] })];
    const tense = report(records).groups[0]?.questions[0];
    expect(tense?.distribution).toEqual({ past: 2 });
  });

  it('summarises latency at the median and the tail', () => {
    const latency = report(v1).groups[0]!.latency;
    expect(latency.p50).toBe(100);
    expect(latency.p95).toBe(300);
    expect(latency.max).toBe(300);
    expect(latency.mean).toBe(200);
    expect(report(v1).groups[0]!.nodeLatency.mean).toBe(1000);
  });

  it('diffs two versions of the same node on its own', () => {
    const result = report([...v1, ...v2]);
    expect(result.drift).toHaveLength(1);
    const drift = result.drift[0]!;
    expect(drift.from).toBe('v1');
    expect(drift.to).toBe('v2');
    const cited = drift.questions.find((q) => q.questionId === 'cited');
    expect(cited?.flaggedRateFrom).toBe(0.5);
    expect(cited?.flaggedRateTo).toBe(0);
    expect(cited?.flaggedRateDelta).toBe(-0.5);
    expect(cited?.meanDelta).toBeCloseTo(0.15 - 0.5, 10);
  });

  it('diffs the two versions it is told to', () => {
    const three = [...v1, ...v2, ...v2.map((r) => ({ ...r, id: `${r.id}-x`, promptVersion: 'v3' }))];
    const result = report(three, { compare: ['v1', 'v3'] });
    expect(result.drift).toHaveLength(1);
    expect(result.drift[0]?.to).toBe('v3');
  });

  it('writes markdown a person can read', () => {
    const result = report([...v1, ...v2], { title: 'Runs 1 to 3' });
    expect(result.markdown).toContain('# Runs 1 to 3');
    expect(result.markdown).toContain('## writer');
    expect(result.markdown).toContain('Drift');
    expect(reportMarkdown({ groups: [], drift: [], markdown: '' })).toContain('No records.');
  });

  it('says how many records carry a judge error', () => {
    const result = report([record({ error: 'the endpoint is rate limiting' })]);
    expect(result.groups[0]?.errors).toBe(1);
    expect(result.markdown).toContain('judge error');
  });
});
