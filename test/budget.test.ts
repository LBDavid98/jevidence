import { describe, expect, it } from 'vitest';
import { BudgetExceeded, CHARS_PER_TOKEN, estimateTokens, planChunks } from '../src/core/budget.js';

describe('the token budget', () => {
  it('estimates from characters', () => {
    expect(estimateTokens('x'.repeat(37))).toBe(Math.ceil(37 / CHARS_PER_TOKEN));
    expect(estimateTokens({ a: 'bc' })).toBe(estimateTokens('{"a":"bc"}'));
  });

  it('keeps everything in one request when it fits', () => {
    const chunks = planChunks(100, [
      { id: 'a', tokens: 10 },
      { id: 'b', tokens: 10 },
    ]);
    expect(chunks).toEqual([['a', 'b']]);
  });

  it('cuts a unit into several requests under the total limit', () => {
    const questions = Array.from({ length: 6 }, (_, i) => ({ id: `q${i}`, tokens: 300 }));
    const chunks = planChunks(500, questions, { maxRequestTokens: 1400, maxStateTokens: 2000 });
    expect(chunks.length).toBe(2);
    expect(chunks.flat()).toHaveLength(6);
    for (const chunk of chunks) expect(500 + chunk.length * 300).toBeLessThanOrEqual(1400);
  });

  it('never drops a question it cannot fit', () => {
    expect(() => planChunks(31_000, [{ id: 'huge', tokens: 4000 }])).toThrow(BudgetExceeded);
    try {
      planChunks(31_000, [{ id: 'huge', tokens: 4000 }]);
    } catch (error) {
      expect((error as BudgetExceeded).questionId).toBe('huge');
      expect((error as Error).message).toContain('huge');
    }
  });
});
