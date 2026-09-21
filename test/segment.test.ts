import { describe, expect, it } from 'vitest';
import { segment, splitParagraphs, splitSentences, spanOf, wholeText } from '../src/core/segment.js';

const TEXT = 'Small businesses spend hours on invoicing every week. Automation cuts that in half [2]. Ask your bookkeeper first.';

describe('segmenting', () => {
  it('cuts sentences and keeps their offsets', () => {
    const spans = splitSentences(TEXT);
    expect(spans).toHaveLength(3);
    expect(spans[0]?.text).toBe('Small businesses spend hours on invoicing every week.');
    expect(TEXT.slice(spans[0]?.start ?? 0, spans[0]?.end ?? 0)).toBe(spans[0]?.text);
    expect(spans[1]?.text).toBe('Automation cuts that in half [2].');
  });

  it('drops runs too short to be a sentence, as the detectors do', () => {
    expect(splitSentences('Yes. No.')).toHaveLength(0);
    expect(splitSentences('Yes. No.', { minLength: 1 })).toHaveLength(2);
  });

  it('strips tags before splitting', () => {
    const spans = splitSentences('<p>The invoice went out on Monday.</p>');
    expect(spans[0]?.text).toBe('The invoice went out on Monday.');
  });

  it('cuts paragraphs on blank lines', () => {
    const text = 'First paragraph here.\nStill the first.\n\n  Second paragraph.\n\n\nThird.';
    const spans = splitParagraphs(text);
    expect(spans.map((s) => s.text)).toEqual(['First paragraph here.\nStill the first.', 'Second paragraph.', 'Third.']);
    for (const span of spans) expect(text.slice(span.start, span.end)).toBe(span.text);
  });

  it('gives the whole text one span when the panel does not segment', () => {
    expect(wholeText('  hello  ')).toEqual([spanOf(2, 'hello')]);
    expect(wholeText('   ')).toEqual([]);
    expect(segment(TEXT, 'none')).toHaveLength(1);
    expect(segment(TEXT, 'sentence')).toHaveLength(3);
    expect(segment(TEXT, 'paragraph')).toHaveLength(1);
  });
});
