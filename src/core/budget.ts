// Token budgeting. Jev takes 64k tokens per request and 32k for the state plus the longest
// question, so a unit's questions x segments are cut into several requests. A question that
// cannot fit on its own is an error, never a silent drop.
import { stateText } from './hash.js';
import type { JsonValue } from './types.js';

/** Characters per token. Jev is text-only and this is close enough to budget with. */
export const CHARS_PER_TOKEN = 3.7;
export const MAX_REQUEST_TOKENS = 64_000;
export const MAX_STATE_TOKENS = 32_000;

export function estimateTokens(value: string | JsonValue): number {
  const text = typeof value === 'string' ? value : stateText(value);
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export interface BudgetLimits {
  /** State plus every question in one request. */
  maxRequestTokens?: number;
  /** State plus the single longest question in the request. */
  maxStateTokens?: number;
}

export class BudgetExceeded extends Error {
  override name = 'BudgetExceeded';
  constructor(
    readonly questionId: string,
    readonly questionTokens: number,
    readonly stateTokens: number,
    readonly limit: number,
  ) {
    super(
      `question "${questionId}" (${questionTokens} tokens) does not fit beside a state of ${stateTokens} tokens under the ${limit}-token limit; shorten the state, the instructions, or split the panel`,
    );
  }
}

/**
 * Split question ids into the fewest chunks that respect both limits, keeping the given order.
 * Throws rather than dropping a question that cannot fit beside the state on its own.
 */
export function planChunks(stateTokens: number, questions: Array<{ id: string; tokens: number }>, limits: BudgetLimits = {}): string[][] {
  const maxRequest = limits.maxRequestTokens ?? MAX_REQUEST_TOKENS;
  const maxState = limits.maxStateTokens ?? MAX_STATE_TOKENS;
  const chunks: string[][] = [];
  let current: string[] = [];
  let currentTokens = 0;
  for (const q of questions) {
    if (stateTokens + q.tokens > maxState || stateTokens + q.tokens > maxRequest) {
      throw new BudgetExceeded(q.id, q.tokens, stateTokens, Math.min(maxState, maxRequest));
    }
    if (current.length > 0 && stateTokens + currentTokens + q.tokens > maxRequest) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push(q.id);
    currentTokens += q.tokens;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}
