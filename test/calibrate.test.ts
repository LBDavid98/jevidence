import { describe, expect, it } from 'vitest';
import { calibrate, calibrationMarkdown, joinLabels } from '../src/core/calibrate.js';
import { parsePanel } from '../src/core/panel.js';
import { judgment, record } from './helpers.js';
import type { JevRecord, Label } from '../src/core/types.js';

const panel = parsePanel({
  id: 'p',
  version: '1',
  segment: 'sentence',
  state: 'output',
  questions: {
    cited: { type: 'noul', instructions: 'This sentence states a figure with no marker.', threshold: 0.5 },
    tense: { type: 'choice', instructions: 'Which tense does this use?', criteria: { past: 'past', present: 'present', none: 'neither' } },
  },
});

/** Twelve sentences: the judge is right on ten of them at a threshold of 0.5. */
function synthetic(): { records: JevRecord[]; labels: Label[] } {
  const probabilities = [0.95, 0.92, 0.88, 0.85, 0.8, 0.6, 0.2, 0.1, 0.05, 0.02, 0.55, 0.45];
  const truths = [true, true, true, true, true, true, false, false, false, false, false, true];
  const judgments = probabilities.map((p, i) => judgment({ questionId: 'cited', segmentIndex: i, answer: p, flagged: p >= 0.5 }));
  const labels: Label[] = truths.map((truth, i) => ({ node: 'writer', stateHash: 'h1', questionId: 'cited', segmentIndex: i, truth, source: 'reviewer' }));
  return { records: [record({ node: 'writer', stateHash: 'h1', judgments })], labels };
}

describe('joining labels to judgments', () => {
  it('matches on node, state, question and segment', () => {
    const { records, labels } = synthetic();
    const joined = joinLabels(records, labels);
    expect(joined.pairs).toHaveLength(12);
    expect(joined.unmatchedLabels).toHaveLength(0);
    expect(joined.unjudged).toBe(0);
  });

  it('keeps a label that matched nothing', () => {
    const { records } = synthetic();
    const stray: Label = { node: 'writer', stateHash: 'other', questionId: 'cited', segmentIndex: 0, truth: true, source: 'reviewer' };
    const joined = joinLabels(records, [stray]);
    expect(joined.unmatchedLabels).toHaveLength(1);
    expect(joined.unjudged).toBe(12);
  });
});

describe('calibrate', () => {
  it('returns the precision and recall a hand-counted set has', () => {
    const { records, labels } = synthetic();
    const report = calibrate(records, labels, { panel });
    const cited = report.questions.find((q) => q.questionId === 'cited');
    expect(cited).toBeDefined();
    // At 0.5: seven predicted positive, six of them true; seven truly positive.
    expect(cited?.tp).toBe(6);
    expect(cited?.fp).toBe(1);
    expect(cited?.fn).toBe(1);
    expect(cited?.tn).toBe(4);
    expect(cited?.precision).toBeCloseTo(6 / 7, 10);
    expect(cited?.recall).toBeCloseTo(6 / 7, 10);
    expect(report.matched).toBe(12);
  });

  it('scores the probabilities with Brier and bins them for ECE', () => {
    const { records, labels } = synthetic();
    const cited = calibrate(records, labels, { panel }).questions[0];
    expect(cited?.brier).toBeGreaterThan(0);
    expect(cited?.brier).toBeLessThan(0.25);
    expect(cited?.bins).toHaveLength(10);
    expect(cited?.bins.reduce((sum, b) => sum + b.n, 0)).toBe(12);
    expect(cited?.ece).toBeGreaterThanOrEqual(0);
  });

  it('sweeps the threshold and names one that reaches the target precision', () => {
    const { records, labels } = synthetic();
    const cited = calibrate(records, labels, { panel, targetPrecision: 0.9 }).questions[0];
    expect(cited?.sweep.length).toBe(19);
    expect(cited?.recommendedThreshold).toBeDefined();
    const at = cited?.sweep.find((s) => s.threshold === cited.recommendedThreshold);
    expect(at?.precision).toBeGreaterThanOrEqual(0.9);
  });

  it('grades a question that answers well as trust', () => {
    const judgments = Array.from({ length: 12 }, (_, i) => judgment({ questionId: 'cited', segmentIndex: i, answer: i < 6 ? 0.95 : 0.05 }));
    const labels: Label[] = Array.from({ length: 12 }, (_, i) => ({ node: 'writer', stateHash: 'h1', questionId: 'cited', segmentIndex: i, truth: i < 6, source: 'reviewer' }));
    const report = calibrate([record({ node: 'writer', stateHash: 'h1', judgments })], labels, { panel });
    expect(report.questions[0]?.grade).toBe('trust');
  });

  it('grades a question that answers at random as drop', () => {
    const judgments = Array.from({ length: 12 }, (_, i) => judgment({ questionId: 'cited', segmentIndex: i, answer: 0.9 }));
    const labels: Label[] = Array.from({ length: 12 }, (_, i) => ({ node: 'writer', stateHash: 'h1', questionId: 'cited', segmentIndex: i, truth: i === 0, source: 'reviewer' }));
    const report = calibrate([record({ node: 'writer', stateHash: 'h1', judgments })], labels, { panel });
    expect(report.questions[0]?.grade).toBe('drop');
  });

  it('will not grade a question trust on too few labels', () => {
    const judgments = [judgment({ questionId: 'cited', segmentIndex: 0, answer: 0.95 })];
    const labels: Label[] = [{ node: 'writer', stateHash: 'h1', questionId: 'cited', segmentIndex: 0, truth: true, source: 'reviewer' }];
    const report = calibrate([record({ node: 'writer', stateHash: 'h1', judgments })], labels, { panel });
    expect(report.questions[0]?.grade).toBe('tune');
    expect(report.questions[0]?.reason).toContain('only 1 label');
  });

  it('measures a choice question by how often it matched the label', () => {
    const judgments = Array.from({ length: 10 }, (_, i) => judgment({ questionId: 'tense', segmentIndex: i, type: 'choice', answer: i < 9 ? 'past' : 'present' }));
    const labels: Label[] = Array.from({ length: 10 }, (_, i) => ({ node: 'writer', stateHash: 'h1', questionId: 'tense', segmentIndex: i, truth: 'past', source: 'reviewer' }));
    const report = calibrate([record({ node: 'writer', stateHash: 'h1', judgments })], labels, { panel });
    expect(report.questions[0]?.accuracy).toBeCloseTo(0.9, 10);
    expect(report.questions[0]?.grade).toBe('trust');
  });

  it('writes a markdown table with a row per question', () => {
    const { records, labels } = synthetic();
    const markdown = calibrationMarkdown(calibrate(records, labels, { panel }), 'Run 1');
    expect(markdown).toContain('# Run 1');
    expect(markdown).toContain('`cited`');
    expect(markdown).toContain('| question |');
  });
});
