import { createHash } from 'node:crypto';
import type { JevState, JsonValue } from './types.js';

/** JSON with object keys in a stable order, so the same state always hashes the same. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/** The join key a Label carries. Stable across processes and machines. */
export function hashState(state: JevState): string {
  return createHash('sha256').update(stableStringify(state)).digest('hex');
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** Text of a state, for token estimates and for the fake client's sentinels. */
export function stateText(state: JevState | JsonValue): string {
  return typeof state === 'string' ? state : stableStringify(state);
}
