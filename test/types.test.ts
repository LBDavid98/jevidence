import { describe, expect, it } from 'vitest';
import { LabelSchema, PanelSchema, QuestionSchema, RecordSchema } from '../src/core/types.js';

describe('the schema', () => {
  it('takes a noul with only instructions', () => {
    const q = QuestionSchema.parse({ type: 'noul', instructions: 'This sentence names a price.' });
    expect(q.type).toBe('noul');
  });

  it('refuses a score with one level', () => {
    expect(QuestionSchema.safeParse({ type: 'score', instructions: 'How clear is it?', criteria: ['clear'] }).success).toBe(false);
  });

  it('refuses a score with eleven levels', () => {
    const criteria = Array.from({ length: 11 }, (_, i) => `level ${i}`);
    expect(QuestionSchema.safeParse({ type: 'score', instructions: 'How clear is it?', criteria }).success).toBe(false);
  });

  it('takes a choice with two options', () => {
    const q = QuestionSchema.parse({ type: 'choice', instructions: 'Which tense?', criteria: { past: 'past tense', none: 'neither' } });
    expect(q.type).toBe('choice');
  });

  it('defaults a panel to no segmentation over input and output', () => {
    const panel = PanelSchema.parse({ id: 'p', version: '1', questions: { a: { type: 'noul', instructions: 'Something is wrong here.' } } });
    expect(panel.segment).toBe('none');
    expect(panel.state).toBe('input+output');
  });

  it('refuses a panel with no questions', () => {
    expect(PanelSchema.safeParse({ id: 'p', version: '1', questions: {} }).success).toBe(false);
  });

  it('round-trips a record and a label', () => {
    const rec = RecordSchema.parse({
      id: 'r',
      ts: '2026-09-21T00:00:00.000Z',
      node: 'n',
      promptVersion: 'v1',
      stateHash: 'h',
      model: 'jev-1.13.0',
      latencyMs: 4,
      inputTokens: 10,
      costUSD: 0,
      judgments: [{ questionId: 'a', type: 'noul', answer: 0.9 }],
      decision: 'flag',
    });
    expect(rec.judgments[0]?.answer).toBe(0.9);
    expect(LabelSchema.parse({ node: 'n', stateHash: 'h', questionId: 'a', truth: true, source: 'reviewer' }).truth).toBe(true);
  });
});
