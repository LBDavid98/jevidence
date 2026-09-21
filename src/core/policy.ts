// What to do about a judgment that crossed its threshold. Observe-only is `policy: undefined`,
// and that is the default: measuring should never be the reason a node behaves differently.
import { questionThreshold } from './panel.js';
import type { Decision, Judgment, JevState, Panel, Question } from './types.js';

/** Weakest to strongest. A unit takes the strongest action any flagged judgment asks for. */
export const DECISION_ORDER: Decision[] = ['pass', 'flag', 'escalate', 'retry', 'block'];
const rank = (d: Decision) => DECISION_ORDER.indexOf(d);
export const strongest = (a: Decision, b: Decision): Decision => (rank(b) > rank(a) ? b : a);

/** Did this answer cross the question's threshold? */
export function crossesThreshold(question: Question, judgment: Judgment): boolean {
  const threshold = questionThreshold(question);
  if (question.type === 'noul') return typeof judgment.answer === 'number' && judgment.answer >= threshold;
  if (question.type === 'score') {
    if (typeof judgment.answer !== 'number') return false;
    return question.flagBelow ? judgment.answer <= threshold : judgment.answer >= threshold;
  }
  const hits = question.flagWhen ?? [];
  if (hits.length === 0) return false;
  if (typeof judgment.answer !== 'string' || !hits.includes(judgment.answer)) return false;
  const probability = judgment.probabilities?.[judgment.answer] ?? judgment.confidence ?? 1;
  return probability >= threshold;
}

export interface EscalationContext {
  node: string;
  panel: Panel;
  state: JevState;
  /** The judgments that crossed their thresholds: what a prose model is asked to explain. */
  flagged: Judgment[];
  judgments: Judgment[];
  attempt: number;
}

/** Where a prose model writes the "why" for what Jev already flagged. */
export type EscalationHandler = (context: EscalationContext) => void | Promise<void>;

/** Build the arguments for a retry from the ones that produced the flagged output. */
export type RetryInputBuilder<A extends unknown[] = unknown[]> = (args: A, flagged: Judgment[]) => A | Promise<A>;

export interface Policy<A extends unknown[] = unknown[]> {
  /** What a flagged judgment asks for when nothing more specific applies. Default `flag`. */
  action?: Exclude<Decision, 'pass'>;
  /** By question id, before severity. */
  perQuestion?: { [questionId: string]: Exclude<Decision, 'pass'> };
  /** By the question's `severity` string, whatever the consumer's vocabulary is. */
  perSeverity?: { [severity: string]: Exclude<Decision, 'pass'> };
  /** Bounds `retry`. Default 1. */
  maxRetries?: number;
  handler?: EscalationHandler;
  retryInput?: RetryInputBuilder<A>;
}

/** A policy that hands the flagged judgments to a handler. */
export function escalate<A extends unknown[] = unknown[]>(handler: EscalationHandler, rest: Omit<Policy<A>, 'action' | 'handler'> = {}): Policy<A> {
  return { ...rest, action: 'escalate', handler };
}

/** Stamp `flagged` and `severity` onto judgments the panel's thresholds pick out. */
export function applyThresholds(panel: Panel, judgments: Judgment[]): Judgment[] {
  return judgments.map((j) => {
    const question = panel.questions[j.questionId];
    if (!question) return j;
    const out: Judgment = { ...j, flagged: crossesThreshold(question, j) };
    if (question.severity !== undefined) out.severity = question.severity;
    return out;
  });
}

export const flaggedOf = (judgments: Judgment[]): Judgment[] => judgments.filter((j) => j.flagged);

export interface PolicyOutcome {
  decision: Decision;
  flagged: Judgment[];
}

/** The unit's decision: the strongest action any flagged judgment asks for. */
export function decide<A extends unknown[]>(panel: Panel, judgments: Judgment[], policy?: Policy<A>): PolicyOutcome {
  const flagged = flaggedOf(judgments);
  if (!policy || flagged.length === 0) return { decision: flagged.length ? 'flag' : 'pass', flagged };
  let decision: Decision = 'pass';
  for (const j of flagged) {
    const question = panel.questions[j.questionId];
    const bySeverity = question?.severity ? policy.perSeverity?.[question.severity] : undefined;
    decision = strongest(decision, policy.perQuestion?.[j.questionId] ?? bySeverity ?? policy.action ?? 'flag');
  }
  return { decision, flagged };
}

/**
 * The default retry: append what was flagged to the node's input. A string argument gets a
 * paragraph; an object gets a `jevidence` field. Anything else is left alone, and the caller
 * should pass `retryInput` instead.
 */
export function defaultRetryInput<A extends unknown[]>(args: A, flagged: Judgment[]): A {
  if (args.length === 0) return args;
  const notes = flagged.map((j) => `- ${j.questionId}${j.span ? `: "${j.span.text}"` : ''}`);
  const next = [...args] as A;
  const last = next[next.length - 1];
  if (typeof last === 'string') {
    (next as unknown[])[next.length - 1] = `${last}\n\nFix these before answering again:\n${notes.join('\n')}`;
  } else if (last && typeof last === 'object' && !Array.isArray(last)) {
    (next as unknown[])[next.length - 1] = { ...(last as object), jevidence: { flagged } };
  }
  return next;
}
