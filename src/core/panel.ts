// Panels are JSON files: an id, a version, how to cut the output, and the questions. They are
// the shareable part of a measurement, so they are validated on the way in and linted for the
// habits that make a typed question answer badly.
import { readFile } from 'node:fs/promises';
import type { WireQuestion, WireQuestions } from './client.js';
import { PanelSchema, type JsonValue, type Panel, type PanelJson, type Question, type StateBuilder, type StateMode } from './types.js';

export class PanelError extends Error {
  override name = 'PanelError';
  constructor(
    message: string,
    readonly issues: string[] = [],
  ) {
    super(message);
  }
}

export type PanelValidation = { ok: true; panel: Panel } | { ok: false; errors: string[] };

/** Validate without throwing. The errors read as sentences, for a CLI to print. */
export function validatePanel(input: unknown): PanelValidation {
  const raw = typeof input === 'string' ? safeJson(input) : input;
  if (raw instanceof Error) return { ok: false, errors: [raw.message] };
  const parsed = PanelSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.') || '(panel)'}: ${i.message}`) };
  }
  return { ok: true, panel: parsed.data as Panel };
}

function safeJson(text: string): unknown | Error {
  try {
    return JSON.parse(text);
  } catch (error) {
    return new PanelError(`the panel is not valid JSON: ${(error as Error).message}`);
  }
}

/** Validate, or throw a PanelError carrying every issue. Accepts an object or JSON text. */
export function parsePanel(input: unknown): Panel {
  const result = validatePanel(input);
  if (!result.ok) throw new PanelError(`the panel does not validate:\n  ${result.errors.join('\n  ')}`, result.errors);
  return result.panel;
}

/** Read a panel from disk. */
export async function loadPanel(path: string): Promise<Panel> {
  return parsePanel(await readFile(path, 'utf8'));
}

/** The JSON form, ready to write back out. A panel whose state is a builder cannot round-trip. */
export function panelToJSON(panel: Panel, space = 2): string {
  if (typeof panel.state === 'function') {
    throw new PanelError('this panel builds its state in code, so it has no JSON form; give `state` a mode to write it out');
  }
  const json: PanelJson = { ...panel, state: panel.state as StateMode };
  return JSON.stringify(json, null, space);
}

export const isStateBuilder = (state: StateMode | StateBuilder): state is StateBuilder => typeof state === 'function';

// ---------------------------------------------------------------------------
// Lint
// ---------------------------------------------------------------------------

export interface LintIssue {
  questionId?: string;
  rule: string;
  severity: 'error' | 'warn';
  message: string;
}

const text = (value: JsonValue | undefined): string => (typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);

// An option that means "none of these". Labels are written with underscores, hyphens or spaces
// depending on the author's habit, and an underscore is a word character, so `says_nothing` never
// reached a `\b`-anchored pattern. Flatten the separators first, then look for the phrase.
const NO_MATCH = /\b(none|nothing|no match|nomatch|neither|other|not applicable|n a|na|unclear|unknown|not an issue|no issue)\b/i;

const meansNoMatch = (label: string): boolean => NO_MATCH.test(label.replace(/[-_/]+/g, ' '));

/**
 * The habits that make a typed question answer badly. Errors are worth refusing over; warnings
 * are style the author may have meant. Nothing here talks to the endpoint.
 */
export function lintPanel(panel: Panel): LintIssue[] {
  const issues: LintIssue[] = [];
  const entries = Object.entries(panel.questions) as Array<[string, Question]>;
  if (entries.length === 0) issues.push({ rule: 'panel-empty', severity: 'error', message: 'a panel needs at least one question' });

  for (const [id, q] of entries) {
    const instructions = text(q.instructions);

    if (id.includes('#')) {
      issues.push({ questionId: id, rule: 'question-id', severity: 'error', message: 'a question id cannot contain "#"; the wrapper uses it to number segments' });
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/.test(id)) {
      issues.push({ questionId: id, rule: 'question-id', severity: 'error', message: 'a question id should be a plain code-safe token' });
    }
    if (instructions.trim().length === 0) {
      issues.push({ questionId: id, rule: 'instructions-present', severity: 'error', message: 'the question has no instructions; the id is never shown to the model' });
    } else if (words(instructions).length < 4) {
      issues.push({
        questionId: id,
        rule: 'instructions-standalone',
        severity: 'warn',
        message: 'the instructions are shorter than four words; the id is code-only, so the question has to stand on its own',
      });
    }

    if (q.type === 'noul') {
      if (/\s(and|or)\s/i.test(instructions)) {
        issues.push({
          questionId: id,
          rule: 'noul-one-condition',
          severity: 'error',
          message: 'the instructions join two conditions with "and"/"or"; split this into one noul per condition',
        });
      }
      if (q.threshold !== undefined && (q.threshold < 0 || q.threshold > 1)) {
        issues.push({ questionId: id, rule: 'threshold-range', severity: 'error', message: 'a noul threshold is a probability between 0 and 1' });
      }
    }

    if (q.type === 'choice') {
      const labels = Object.keys(q.criteria);
      if (labels.length < 2) issues.push({ questionId: id, rule: 'choice-options', severity: 'error', message: 'a choice needs at least two options' });
      if (labels.length > 255) issues.push({ questionId: id, rule: 'choice-options', severity: 'error', message: 'a choice takes at most 255 options' });
      if (!labels.some(meansNoMatch)) {
        issues.push({
          questionId: id,
          rule: 'choice-no-match',
          severity: 'warn',
          message: 'no option means "none of these"; without one the model has to pick something',
        });
      }
      if (q.threshold !== undefined && (q.threshold < 0 || q.threshold > 1)) {
        issues.push({ questionId: id, rule: 'threshold-range', severity: 'error', message: 'a choice threshold is a probability between 0 and 1' });
      }
    }

    if (q.type === 'score') {
      const levels = q.criteria.length;
      if (levels < 2) issues.push({ questionId: id, rule: 'score-levels', severity: 'error', message: 'a score needs at least two levels' });
      if (levels > 10) issues.push({ questionId: id, rule: 'score-levels', severity: 'error', message: 'a score takes at most ten levels' });
      if (q.threshold !== undefined && (q.threshold < 0 || q.threshold > levels - 1)) {
        issues.push({ questionId: id, rule: 'threshold-range', severity: 'error', message: `a score threshold names a level between 0 and ${levels - 1}` });
      }
      for (const [i, level] of q.criteria.entries()) {
        if (text(level).trim().length === 0) {
          issues.push({ questionId: id, rule: 'score-levels', severity: 'warn', message: `level ${i} has no description` });
        }
      }
    }
  }
  return issues;
}

export const lintErrors = (issues: LintIssue[]): LintIssue[] => issues.filter((i) => i.severity === 'error');

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/** Strip Jevidence's own fields; what is left is what the endpoint takes. */
export function toWireQuestion(question: Question): WireQuestion {
  const wire: WireQuestion = { type: question.type };
  if (question.instructions !== undefined) wire.instructions = question.instructions;
  if (question.criteria !== undefined) wire.criteria = question.criteria as JsonValue;
  return wire;
}

export function toWireQuestions(questions: { [id: string]: Question }): WireQuestions {
  const out: WireQuestions = {};
  for (const [id, q] of Object.entries(questions)) out[id] = toWireQuestion(q);
  return out;
}

/** The threshold a judgment is measured against: the question's own, or a sensible default. */
export function questionThreshold(question: Question): number {
  if (question.threshold !== undefined) return question.threshold;
  if (question.type === 'score') return Math.ceil((question.criteria.length - 1) / 2);
  return 0.5;
}
