import { describe, expect, it } from 'vitest';
import { parsePanel } from '../src/core/panel.js';
import { DECISION_ORDER, applyThresholds, crossesThreshold, decide, defaultRetryInput, escalate, flaggedOf, strongest } from '../src/core/policy.js';
import { judgment } from './helpers.js';
import type { Panel } from '../src/core/types.js';

const panel: Panel = parsePanel({
  id: 'p',
  version: '1',
  segment: 'none',
  state: 'output',
  questions: {
    cited: { type: 'noul', instructions: 'This sentence states a figure with no marker.', threshold: 0.7, severity: 'hard' },
    jargon: { type: 'noul', instructions: 'This sentence uses a term an owner would not know.', threshold: 0.6, severity: 'advisory' },
    tense: { type: 'choice', instructions: 'Which tense does this use?', criteria: { past: 'past', present: 'present', none: 'neither' }, flagWhen: ['past'], threshold: 0.5 },
    clarity: { type: 'score', instructions: 'How clear is this?', criteria: ['unclear', 'ok', 'clear'], threshold: 1, flagBelow: true },
  },
});

describe('thresholds', () => {
  it('flags a noul at or above its threshold', () => {
    const q = panel.questions['cited']!;
    expect(crossesThreshold(q, judgment({ questionId: 'cited', answer: 0.7 }))).toBe(true);
    expect(crossesThreshold(q, judgment({ questionId: 'cited', answer: 0.69 }))).toBe(false);
  });

  it('flags a choice only for the labels named, and only when confident', () => {
    const q = panel.questions['tense']!;
    expect(crossesThreshold(q, judgment({ questionId: 'tense', type: 'choice', answer: 'past', probabilities: { past: 0.8 } }))).toBe(true);
    expect(crossesThreshold(q, judgment({ questionId: 'tense', type: 'choice', answer: 'past', probabilities: { past: 0.3 } }))).toBe(false);
    expect(crossesThreshold(q, judgment({ questionId: 'tense', type: 'choice', answer: 'none', probabilities: { none: 0.9 } }))).toBe(false);
  });

  it('flags a score below its threshold when low is the problem', () => {
    const q = panel.questions['clarity']!;
    expect(crossesThreshold(q, judgment({ questionId: 'clarity', type: 'score', answer: 0 }))).toBe(true);
    expect(crossesThreshold(q, judgment({ questionId: 'clarity', type: 'score', answer: 2 }))).toBe(false);
  });

  it('stamps flagged and severity onto the judgments', () => {
    const judgments = applyThresholds(panel, [judgment({ questionId: 'cited', answer: 0.9 }), judgment({ questionId: 'jargon', answer: 0.1 })]);
    expect(judgments[0]?.flagged).toBe(true);
    expect(judgments[0]?.severity).toBe('hard');
    expect(judgments[1]?.flagged).toBe(false);
    expect(flaggedOf(judgments)).toHaveLength(1);
  });
});

describe('deciding', () => {
  const flagged = applyThresholds(panel, [judgment({ questionId: 'cited', answer: 0.9 }), judgment({ questionId: 'jargon', answer: 0.95 })]);

  it('passes when nothing crossed', () => {
    expect(decide(panel, applyThresholds(panel, [judgment({ questionId: 'cited', answer: 0.1 })])).decision).toBe('pass');
  });

  it('flags by default, with no policy at all', () => {
    expect(decide(panel, flagged).decision).toBe('flag');
    expect(decide(panel, flagged).flagged).toHaveLength(2);
  });

  it('takes the strongest action any flagged judgment asks for', () => {
    expect(decide(panel, flagged, { action: 'flag', perQuestion: { cited: 'block' } }).decision).toBe('block');
    expect(decide(panel, flagged, { perSeverity: { hard: 'retry', advisory: 'flag' } }).decision).toBe('retry');
    expect(decide(panel, flagged, { perSeverity: { advisory: 'escalate' } }).decision).toBe('escalate');
    expect(strongest('flag', 'block')).toBe('block');
    expect(DECISION_ORDER.indexOf('pass')).toBe(0);
  });

  it('builds an escalation policy from a handler', () => {
    const policy = escalate(() => {});
    expect(policy.action).toBe('escalate');
    expect(decide(panel, flagged, policy).decision).toBe('escalate');
  });
});

describe('the default retry input', () => {
  it('appends the findings to a string argument', () => {
    const [next] = defaultRetryInput(['write about invoicing'], [judgment({ questionId: 'cited', span: { start: 0, end: 4, text: 'here' } })]);
    expect(next).toContain('write about invoicing');
    expect(next).toContain('cited');
    expect(next).toContain('here');
  });

  it('adds a field to an object argument', () => {
    const [next] = defaultRetryInput([{ brief: 'invoicing' }], [judgment({ questionId: 'cited' })]);
    expect(next).toHaveProperty('brief', 'invoicing');
    expect(next).toHaveProperty('jevidence');
  });

  it('leaves anything else alone', () => {
    expect(defaultRetryInput([], [])).toEqual([]);
    expect(defaultRetryInput([42], [judgment({ questionId: 'cited' })])).toEqual([42]);
  });
});
