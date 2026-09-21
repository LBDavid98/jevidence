import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PanelError, lintErrors, lintPanel, loadPanel, panelToJSON, parsePanel, questionThreshold, toWireQuestion, toWireQuestions, validatePanel, isStateBuilder } from '../src/core/panel.js';
import type { Panel } from '../src/core/types.js';

const good = {
  id: 'p',
  version: '2',
  segment: 'sentence',
  state: 'input+output',
  questions: {
    'claim-uncited': { type: 'noul', instructions: 'This sentence states a figure with no citation marker.', threshold: 0.7, severity: 'hard' },
  },
};

describe('panels', () => {
  it('validates and parses', () => {
    const result = validatePanel(good);
    expect(result.ok).toBe(true);
    expect(parsePanel(JSON.stringify(good)).version).toBe('2');
  });

  it('reports what is wrong instead of throwing', () => {
    const result = validatePanel({ id: 'p', questions: {} });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toContain('version');
  });

  it('throws a PanelError with the issues on it', () => {
    expect(() => parsePanel('{ not json')).toThrow(PanelError);
    expect(() => parsePanel({ id: 'p', version: '1', questions: { a: { type: 'noul' } } })).toThrow(PanelError);
  });

  it('reads a panel from disk', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'jevidence-'));
    const path = join(dir, 'panel.json');
    await writeFile(path, JSON.stringify(good), 'utf8');
    const panel = await loadPanel(path);
    expect(panel.id).toBe('p');
  });

  it('writes the JSON form back out', () => {
    const panel = parsePanel(good);
    expect(JSON.parse(panelToJSON(panel)).questions['claim-uncited'].threshold).toBe(0.7);
    const built: Panel = { ...panel, state: () => 'anything' };
    expect(isStateBuilder(built.state)).toBe(true);
    expect(() => panelToJSON(built)).toThrow(PanelError);
  });

  it('rejects a compound noul', () => {
    const panel = parsePanel({ ...good, questions: { both: { type: 'noul', instructions: 'This sentence gives a figure and omits the citation.' } } });
    const issues = lintErrors(lintPanel(panel));
    expect(issues.map((i) => i.rule)).toContain('noul-one-condition');
  });

  it('warns about a choice with no way out', () => {
    const panel = parsePanel({
      ...good,
      questions: { tense: { type: 'choice', instructions: 'Which tense does this use?', criteria: { past: 'past', present: 'present' } } },
    });
    const issues = lintPanel(panel);
    expect(issues.find((i) => i.rule === 'choice-no-match')?.severity).toBe('warn');
    const withNone = parsePanel({
      ...good,
      questions: { tense: { type: 'choice', instructions: 'Which tense does this use?', criteria: { past: 'past', present: 'present', none: 'neither' } } },
    });
    expect(lintPanel(withNone).find((i) => i.rule === 'choice-no-match')).toBeUndefined();
  });

  it('warns when the instructions lean on the id', () => {
    const panel = parsePanel({ ...good, questions: { jargon: { type: 'noul', instructions: 'Jargon?' } } });
    expect(lintPanel(panel).find((i) => i.rule === 'instructions-standalone')?.severity).toBe('warn');
  });

  it('refuses a threshold outside the probability range', () => {
    const panel = parsePanel({ ...good, questions: { a: { type: 'noul', instructions: 'This sentence names a price.', threshold: 1.4 } } });
    expect(lintErrors(lintPanel(panel)).map((i) => i.rule)).toContain('threshold-range');
  });

  it('refuses an id the wrapper cannot suffix', () => {
    const panel = { ...parsePanel(good) } as Panel;
    panel.questions = { 'bad#id': { type: 'noul', instructions: 'This sentence names a price.' } };
    expect(lintErrors(lintPanel(panel)).map((i) => i.rule)).toContain('question-id');
  });

  it('strips its own fields off the wire question', () => {
    const panel = parsePanel(good);
    const question = panel.questions['claim-uncited'];
    expect(question).toBeDefined();
    expect(toWireQuestion(question!)).toEqual({ type: 'noul', instructions: 'This sentence states a figure with no citation marker.' });
    expect(Object.keys(toWireQuestions(panel.questions))).toEqual(['claim-uncited']);
  });

  it('defaults a threshold when the question does not give one', () => {
    expect(questionThreshold({ type: 'noul', instructions: 'x' })).toBe(0.5);
    expect(questionThreshold({ type: 'score', instructions: 'x', criteria: ['a', 'b', 'c', 'd', 'e'] })).toBe(2);
  });
});
