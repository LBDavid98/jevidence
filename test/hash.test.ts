import { describe, expect, it } from 'vitest';
import { hashState, stableStringify, stateText } from '../src/core/hash.js';

describe('hashing a state', () => {
  it('ignores key order', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(hashState({ b: 1, a: 2 })).toBe(hashState({ a: 2, b: 1 }));
  });

  it('separates different states', () => {
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: 2 }));
  });

  it('leaves a string state alone', () => {
    expect(stateText('a sentence')).toBe('a sentence');
    expect(stateText({ a: 1 })).toBe('{"a":1}');
  });
});
