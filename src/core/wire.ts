// The two conventions the wrapper and the clients share: how a segment travels inside a
// question's instructions, and how a question id carries the segment it is about.
import type { JsonValue } from './types.js';

/** `claim-cited#3` is the claim-cited question asked about segment 3. */
export const segmentedId = (questionId: string, segmentIndex: number): string => `${questionId}#${segmentIndex}`;

export function parseQuestionId(id: string): { questionId: string; segmentIndex?: number } {
  const hash = id.lastIndexOf('#');
  if (hash < 0) return { questionId: id };
  const suffix = id.slice(hash + 1);
  if (!/^\d+$/.test(suffix)) return { questionId: id };
  return { questionId: id.slice(0, hash), segmentIndex: Number(suffix) };
}

/** Instructions for one segment: the question, plus the span it is about. */
export interface SegmentedInstructions {
  question: JsonValue;
  segment: { index: number; text: string };
  [key: string]: JsonValue;
}

export function withSegment(instructions: JsonValue, index: number, text: string): SegmentedInstructions {
  return { question: instructions, segment: { index, text } };
}

/** The segment an instruction is about, when it has one. */
export function segmentOfInstructions(instructions: JsonValue | undefined): { index: number; text: string } | undefined {
  if (!instructions || typeof instructions !== 'object' || Array.isArray(instructions)) return undefined;
  const seg = (instructions as { segment?: unknown }).segment;
  if (!seg || typeof seg !== 'object' || Array.isArray(seg)) return undefined;
  const { index, text } = seg as { index?: unknown; text?: unknown };
  if (typeof index !== 'number' || typeof text !== 'string') return undefined;
  return { index, text };
}
