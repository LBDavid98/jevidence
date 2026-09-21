// The wrapper. `measure(node, panel, opts)` gives back a function with the node's signature:
// it runs the node, asks the panel about what came out, records it, and — only if a policy says
// so — does something about it. The node runs once unless the policy asks for a retry.
import { randomUUID } from 'node:crypto';
import { estimateTokens, type BudgetLimits, planChunks } from './budget.js';
import type { JevClient, JudgeResult, WireQuestion, WireQuestions } from './client.js';
import { hashState, stateText } from './hash.js';
import type { Ledger } from './ledger.js';
import { questionThreshold, toWireQuestion } from './panel.js';
import { applyThresholds, decide, defaultRetryInput, type Policy } from './policy.js';
import { segment, type SentenceOptions } from './segment.js';
import type { Decision, Identity, JevRecord, JevState, JsonValue, Judgment, Panel, Span } from './types.js';
import { parseQuestionId, segmentedId, withSegment } from './wire.js';

/** Anything JSON can hold, or a string of whatever it could not. */
export function asJson(value: unknown): JsonValue {
  if (value === undefined) return null;
  try {
    const text = JSON.stringify(value);
    return text === undefined ? null : (JSON.parse(text) as JsonValue);
  } catch {
    return String(value);
  }
}

/** The text a panel segments: a string output as it is, a `.text` field, else the JSON. */
export function defaultOutputText(output: unknown): string {
  if (typeof output === 'string') return output;
  if (output && typeof output === 'object') {
    const text = (output as { text?: unknown }).text;
    if (typeof text === 'string') return text;
  }
  return stateText(asJson(output));
}

// ---------------------------------------------------------------------------
// runPanel — a panel over one state. measure() and replay() both go through it.
// ---------------------------------------------------------------------------

export interface RunPanelOptions {
  client: JevClient;
  /** The text the panel's segments are cut from. Defaults to the state's `output` field. */
  text?: string;
  /** Override the panel's own segmentation. */
  segments?: Span[];
  budget?: BudgetLimits;
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  sentence?: SentenceOptions;
}

export interface PanelRun {
  judgments: Judgment[];
  segments: Span[];
  model: string;
  inputTokens: number;
  costUSD: number;
  /** Summed over every request the unit needed. */
  latencyMs: number;
  requests: number;
  stateHash: string;
}

const textOfState = (state: JevState): string => {
  if (typeof state === 'string') return state;
  if (state && typeof state === 'object' && !Array.isArray(state)) {
    const output = (state as { output?: unknown }).output;
    if (typeof output === 'string') return output;
    if (output !== undefined) return stateText(output as JsonValue);
  }
  return stateText(state);
};

/**
 * Ask every question about every segment, in as few requests as the token budget allows.
 * A question that has no answer in the reply is an error, never a quiet gap.
 */
export async function runPanel(panel: Panel, state: JevState, options: RunPanelOptions): Promise<PanelRun> {
  const { client, budget, model, signal, timeoutMs, sentence } = options;
  const segments = options.segments ?? (panel.segment === 'none' ? [] : segment(options.text ?? textOfState(state), panel.segment, sentence));
  const units: Array<{ id: string; wire: WireQuestion; questionId: string; segmentIndex?: number; tokens: number }> = [];

  for (const [questionId, question] of Object.entries(panel.questions)) {
    const base = toWireQuestion(question);
    if (panel.segment === 'none' || segments.length === 0 || question.per === 'unit') {
      units.push({ id: questionId, wire: base, questionId, tokens: estimateTokens(stateText({ ...base } as JsonValue)) });
      continue;
    }
    segments.forEach((span, index) => {
      const wire: WireQuestion = { ...base, instructions: withSegment(base.instructions ?? null, index, span.text) as unknown as JsonValue };
      units.push({ id: segmentedId(questionId, index), wire, questionId, segmentIndex: index, tokens: estimateTokens(stateText(wire as unknown as JsonValue)) });
    });
  }

  const stateTokens = estimateTokens(stateText(state));
  const chunks = planChunks(stateTokens, units.map((u) => ({ id: u.id, tokens: u.tokens })), budget);
  const byId = new Map(units.map((u) => [u.id, u]));

  const answers: JudgeResult['answers'] = {};
  let inputTokens = 0;
  let costUSD = 0;
  let latencyMs = 0;
  let answeredModel = model ?? '';

  for (const chunk of chunks) {
    const questions: WireQuestions = {};
    for (const id of chunk) {
      const unit = byId.get(id);
      if (unit) questions[id] = unit.wire;
    }
    const judgeOptions: { model?: string; signal?: AbortSignal; timeoutMs?: number } = {};
    if (model !== undefined) judgeOptions.model = model;
    if (signal !== undefined) judgeOptions.signal = signal;
    if (timeoutMs !== undefined) judgeOptions.timeoutMs = timeoutMs;
    const result = await client.judge(state, questions, judgeOptions);
    Object.assign(answers, result.answers);
    inputTokens += result.usage.input_tokens;
    costUSD += result.costUSD;
    latencyMs += result.latencyMs;
    answeredModel = result.model || answeredModel;
  }

  const missing = units.filter((u) => answers[u.id] === undefined).map((u) => u.id);
  if (missing.length > 0) {
    throw new Error(`the judge answered ${units.length - missing.length} of ${units.length} questions; nothing answered for: ${missing.slice(0, 8).join(', ')}`);
  }

  const judgments: Judgment[] = units.map((unit) => {
    const answer = answers[unit.id] as NonNullable<(typeof answers)[string]>;
    const question = panel.questions[unit.questionId];
    const value = answer.type === 'noul' ? (answer.noul ?? 0) : answer.type === 'choice' ? (answer.choice ?? '') : (answer.score ?? 0);
    const judgment: Judgment = { questionId: unit.questionId, type: answer.type, answer: value };
    if (unit.segmentIndex !== undefined) {
      judgment.segmentIndex = unit.segmentIndex;
      const span = segments[unit.segmentIndex];
      if (span) judgment.span = span;
    }
    if (answer.probabilities) judgment.probabilities = answer.probabilities;
    if (answer.confidence !== undefined) judgment.confidence = answer.confidence;
    if (answer.legend) judgment.legend = answer.legend;
    if (question?.severity !== undefined) judgment.severity = question.severity;
    return judgment;
  });

  return {
    judgments: applyThresholds(panel, judgments),
    segments,
    model: answeredModel,
    inputTokens,
    costUSD,
    latencyMs,
    requests: chunks.length,
    stateHash: hashState(state),
  };
}

/** What a question is measured against, for a report that has the panel in hand. */
export const thresholdsOf = (panel: Panel): { [questionId: string]: number } => {
  const out: { [questionId: string]: number } = {};
  for (const [id, q] of Object.entries(panel.questions)) out[id] = questionThreshold(q);
  return out;
};

// ---------------------------------------------------------------------------
// measure
// ---------------------------------------------------------------------------

export type NodeFn<A extends unknown[], R> = (...args: A) => Promise<R> | R;

/** Thrown when the policy says `block`. The record is already in the ledger. */
export class Blocked extends Error {
  override name = 'Blocked';
  constructor(readonly record: JevRecord) {
    super(`${record.node}: blocked by ${record.judgments.filter((j) => j.flagged).length} flagged judgment(s)`);
  }
}

export interface MeasureOptions<A extends unknown[], R> {
  client: JevClient;
  identity: Identity;
  ledger?: Ledger;
  /** Leave it out and the wrapper only observes. */
  policy?: Policy<A>;
  /** Build the state yourself, instead of the panel's mode. */
  buildState?: (context: { input: A; output: R; meta?: JsonValue }) => JevState;
  /** The text the panel segments. Defaults to the output, or its `text` field. */
  outputText?: (output: R) => string;
  /** Named fields carried into the state beside input and output. */
  meta?: JsonValue | ((context: { input: A; output: R }) => JsonValue);
  budget?: BudgetLimits;
  model?: string;
  sentence?: SentenceOptions;
  /** A judge that failed is recorded and the node's result still comes back. Default true. */
  tolerateJudgeErrors?: boolean;
  onRecord?: (record: JevRecord) => void | Promise<void>;
  now?: () => Date;
  newId?: () => string;
}

/** Wrap a node so every call is judged by the panel. The returned function has the node's signature. */
export function measure<A extends unknown[], R>(node: NodeFn<A, R>, panel: Panel, options: MeasureOptions<A, R>): (...args: A) => Promise<R> {
  const {
    client,
    identity,
    ledger,
    policy,
    budget,
    model,
    sentence,
    tolerateJudgeErrors = true,
    now = () => new Date(),
    newId = () => randomUUID(),
  } = options;
  const outputText = options.outputText ?? ((output: R) => defaultOutputText(output));

  return async (...initial: A): Promise<R> => {
    let args = initial;
    let attempt = 0;
    const maxRetries = policy?.maxRetries ?? 1;

    for (;;) {
      const startedNode = Date.now();
      const output = await node(...args);
      const nodeMs = Date.now() - startedNode;
      const meta = typeof options.meta === 'function' ? options.meta({ input: args, output }) : options.meta;

      const state: JevState = options.buildState
        ? options.buildState({ input: args, output, ...(meta !== undefined ? { meta } : {}) })
        : typeof panel.state === 'function'
          ? panel.state({ input: args.length === 1 ? args[0] : args, output, ...(meta !== undefined ? { meta } : {}) })
          : panel.state === 'output'
            ? { output: asJson(output), ...(meta !== undefined ? { meta } : {}) }
            : { input: asJson(args.length === 1 ? args[0] : args), output: asJson(output), ...(meta !== undefined ? { meta } : {}) };

      let run: PanelRun | undefined;
      let failure: Error | undefined;
      try {
        const runOptions: RunPanelOptions = { client, text: outputText(output) };
        if (budget !== undefined) runOptions.budget = budget;
        if (model !== undefined) runOptions.model = model;
        if (sentence !== undefined) runOptions.sentence = sentence;
        run = await runPanel(panel, state, runOptions);
      } catch (error) {
        if (!tolerateJudgeErrors) throw error;
        failure = error instanceof Error ? error : new Error(String(error));
      }

      const judgments = run?.judgments ?? [];
      const outcome = run ? decide(panel, judgments, policy) : { decision: 'pass' as Decision, flagged: [] };
      const retrying = outcome.decision === 'retry' && attempt < maxRetries;
      const decision: Decision = outcome.decision === 'retry' && !retrying ? 'flag' : outcome.decision;

      const record: JevRecord = {
        id: newId(),
        ts: now().toISOString(),
        node: identity.node,
        promptVersion: identity.promptVersion,
        stateHash: run?.stateHash ?? hashState(state),
        model: run?.model ?? (model ?? ''),
        latencyMs: run?.latencyMs ?? 0,
        nodeLatencyMs: nodeMs,
        inputTokens: run?.inputTokens ?? 0,
        costUSD: run?.costUSD ?? 0,
        judgments,
        decision,
        panelId: panel.id,
        panelVersion: panel.version,
      };
      if (identity.runId !== undefined) record.runId = identity.runId;
      if (failure) record.error = failure.message;

      await ledger?.append(record);
      await options.onRecord?.(record);

      if (retrying) {
        attempt += 1;
        const build = policy?.retryInput ?? defaultRetryInput;
        args = await build(args, outcome.flagged);
        continue;
      }
      if (decision === 'block') throw new Blocked(record);
      if (decision === 'escalate' && policy?.handler) {
        await policy.handler({ node: identity.node, panel, state, flagged: outcome.flagged, judgments, attempt });
      }
      return output;
    }
  };
}

export { parseQuestionId };
