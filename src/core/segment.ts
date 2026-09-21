// Cutting the output into the spans a question is asked about. Code picks the span, never the
// model, so a judgment is locatable and a finding quotes the segment verbatim by construction.
//
// The sentence splitter is deliberately the same algorithm the Dumas tier-0 detectors use, down
// to the offsets, so a judgment's span and a detector's span name the same characters.
import type { Span, SegmentMode } from './types.js';

export const spanOf = (start: number, text: string): Span => ({ start, end: start + text.length, text });

const stripHtml = (text: string) => text.replace(/<[^>]+>/g, ' ');

export interface SentenceOptions {
  /** Shorter runs are not sentences. 12 characters, as the detectors have it. */
  minLength?: number;
  /** Tags are replaced with a space before splitting, so offsets survive. */
  html?: boolean;
  /**
   * The detectors start a sentence's span at the character after the previous full stop, which
   * is usually the space in front of it: `span.text` is trimmed, `span.start` is not. That is
   * what lines the spans up with theirs, so it is the default. Set this to move `start` onto
   * the first character of the text.
   */
  trimOffsets?: boolean;
}

/** Sentences, as spans into the text. */
export function splitSentences(text: string, options: SentenceOptions = {}): Span[] {
  const { minLength = 12, html = true, trimOffsets = false } = options;
  const plain = html ? stripHtml(text) : text;
  const out: Span[] = [];
  const re = /[^.!?…]+[.!?…]*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(plain)) !== null) {
    const s = m[0].trim();
    const lead = trimOffsets ? m[0].length - m[0].trimStart().length : 0;
    if (s.length > minLength) out.push(spanOf(m.index + lead, s));
  }
  return out;
}

/** Paragraphs: runs of text between blank lines, as spans. */
export function splitParagraphs(text: string): Span[] {
  const out: Span[] = [];
  const re = /\n[ \t]*\n+/g;
  let cursor = 0;
  let m: RegExpExecArray | null;
  const push = (from: number, to: number) => {
    const raw = text.slice(from, to);
    const body = raw.trim();
    if (body.length > 0) out.push(spanOf(from + (raw.length - raw.trimStart().length), body));
  };
  while ((m = re.exec(text)) !== null) {
    push(cursor, m.index);
    cursor = m.index + m[0].length;
  }
  push(cursor, text.length);
  return out;
}

/**
 * The whole text as one span. `segment: 'none'` still produces a unit, so every panel takes the
 * same path and a judgment always has somewhere to hang.
 */
export function wholeText(text: string): Span[] {
  const body = text.trim();
  if (!body) return [];
  return [spanOf(text.indexOf(body), body)];
}

export function segment(text: string, mode: SegmentMode, options: SentenceOptions = {}): Span[] {
  if (mode === 'sentence') return splitSentences(text, options);
  if (mode === 'paragraph') return splitParagraphs(text);
  return wholeText(text);
}
