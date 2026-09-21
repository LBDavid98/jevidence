import { describe, expect, it } from 'vitest';
import { fakeClient } from '../src/core/client.js';
import { lintErrors, lintPanel, loadPanel } from '../src/core/panel.js';
import { runPanel } from '../src/core/measure.js';

const ARTICLE = [
  'Invoicing eats about six hours a week in a small firm [1].',
  'Automation removes most of that overhead, according to one widely cited survey.',
  'Ask your bookkeeper what the change would cost before you buy anything.',
].join(' ');

describe('the panels this package ships', () => {
  it('load and lint clean', async () => {
    for (const name of ['seo-review', 'brief-check', 'generic-quality']) {
      const panel = await loadPanel(`panels/${name}.json`);
      expect(panel.id).toBe(name);
      expect(lintErrors(lintPanel(panel))).toEqual([]);
    }
  });

  it('runs the SEO panel over a section, one question per sentence and one per section', async () => {
    const panel = await loadPanel('panels/seo-review.json');
    const client = fakeClient();
    const run = await runPanel(panel, { input: { brief: 'invoicing costs' }, output: ARTICLE }, { client });
    expect(run.segments).toHaveLength(3);
    // Four per-sentence questions over three sentences, plus two per-section questions.
    expect(run.judgments).toHaveLength(4 * 3 + 2);
    expect(run.judgments.filter((j) => j.questionId === 'heading-answered')).toHaveLength(1);
    expect(run.judgments.every((j) => j.type === 'noul')).toBe(true);
    for (const j of run.judgments) expect(typeof j.flagged).toBe('boolean');
  });

  it('runs the generic panel as one question about the whole answer', async () => {
    const panel = await loadPanel('panels/generic-quality.json');
    const run = await runPanel(panel, { input: 'write about invoicing', output: ARTICLE }, { client: fakeClient() });
    expect(run.judgments).toHaveLength(4);
    expect(run.judgments.every((j) => j.segmentIndex === undefined)).toBe(true);
  });

  it('asks a brief-check question of every line', async () => {
    const panel = await loadPanel('panels/brief-check.json');
    const brief = 'The market grew twelve percent in 2025 [1]. Nine in ten businesses now use an AI tool [2].';
    const run = await runPanel(panel, { input: { sources: ['[1] example.com', '[2] example.org'] }, output: brief }, { client: fakeClient() });
    expect(Object.keys(panel.questions)).toHaveLength(21);
    expect(run.judgments).toHaveLength(21 * 2);
  });
});
