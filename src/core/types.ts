// The schema. Jevidence defines its own Record, Label, Panel and Judgment; nothing here is
// shaped after another tool's file format. Interop is an adapter written against `Ledger`.
import { z } from 'zod';

/** Any JSON value. Jev accepts text, an object, or an array as state or as instructions. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValueSchema), z.record(JsonValueSchema)]),
);

/** What a question is asked about: text, a JSON object, or an array. */
export type JevState = JsonValue;

export const QuestionTypeSchema = z.enum(['noul', 'choice', 'score']);
export type QuestionType = z.infer<typeof QuestionTypeSchema>;

/** A character range in the segmented text, carried so a judgment is locatable. */
export const SpanSchema = z.object({ start: z.number().int().min(0), end: z.number().int().min(0), text: z.string() });
export type Span = z.infer<typeof SpanSchema>;

const common = {
  /**
   * Whether this question is asked about each segment or once about the whole unit. Default
   * `segment` when the panel segments at all, so a panel can mix a per-sentence question with
   * one about the section it sits in.
   */
  per: z.enum(['segment', 'unit']).optional(),
  /** Jevidence's addition: the probability (noul, choice) or level (score) at which this counts as a hit. */
  threshold: z.number().optional(),
  /** Jevidence's addition: a free string the consumer maps to its own severities. */
  severity: z.string().optional(),
  /** Optional prose for humans reading the panel. Never sent to the model. */
  note: z.string().optional(),
};

export const NoulQuestionSchema = z.object({
  type: z.literal('noul'),
  instructions: JsonValueSchema,
  criteria: z.object({ true: JsonValueSchema.optional(), false: JsonValueSchema.optional() }).optional(),
  ...common,
});

export const ChoiceQuestionSchema = z.object({
  type: z.literal('choice'),
  instructions: JsonValueSchema,
  criteria: z.record(JsonValueSchema).refine((c) => Object.keys(c).length >= 2 && Object.keys(c).length <= 255, {
    message: 'a choice takes between 2 and 255 options',
  }),
  /** Which labels count as a hit. A choice with none is descriptive: it is recorded, never flagged. */
  flagWhen: z.array(z.string()).optional(),
  ...common,
});

export const ScoreQuestionSchema = z.object({
  type: z.literal('score'),
  instructions: JsonValueSchema,
  criteria: z.array(JsonValueSchema).min(2, 'a score takes at least 2 levels').max(10, 'a score takes at most 10 levels'),
  /** Flag at or below the threshold instead of at or above it, for a score where low is the problem. */
  flagBelow: z.boolean().optional(),
  ...common,
});

export const QuestionSchema = z.discriminatedUnion('type', [NoulQuestionSchema, ChoiceQuestionSchema, ScoreQuestionSchema]);
export type NoulQuestion = z.infer<typeof NoulQuestionSchema>;
export type ChoiceQuestion = z.infer<typeof ChoiceQuestionSchema>;
export type ScoreQuestion = z.infer<typeof ScoreQuestionSchema>;
export type Question = z.infer<typeof QuestionSchema>;

/** How the output is cut before questions are asked of it. */
export const SegmentModeSchema = z.enum(['none', 'sentence', 'paragraph']);
export type SegmentMode = z.infer<typeof SegmentModeSchema>;

/** Which parts of the call become the state the questions are asked about. */
export const StateModeSchema = z.enum(['input+output', 'output']);
export type StateMode = z.infer<typeof StateModeSchema>;

/** A panel may build its own state instead of naming a mode; only the named modes survive a round trip through JSON. */
export type StateBuilder = (ctx: { input: unknown; output: unknown; meta?: JsonValue }) => JevState;

export const PanelSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  /** Free prose for whoever opens the file. */
  description: z.string().optional(),
  segment: SegmentModeSchema.default('none'),
  state: StateModeSchema.default('input+output'),
  questions: z.record(QuestionSchema).refine((q) => Object.keys(q).length > 0, { message: 'a panel needs at least one question' }),
});

/** The JSON form of a panel: what `loadPanel` reads and `panelToJSON` writes. */
export type PanelJson = z.infer<typeof PanelSchema>;

/** A panel in memory. `state` may also be a builder function, which JSON cannot hold. */
export type Panel = Omit<PanelJson, 'state'> & { state: StateMode | StateBuilder };

/** One question's answer about one segment. */
export const JudgmentSchema = z.object({
  questionId: z.string(),
  segmentIndex: z.number().int().min(0).optional(),
  span: SpanSchema.optional(),
  type: QuestionTypeSchema,
  /** noul: the probability. choice: the label. score: the expected level. */
  answer: z.union([z.number(), z.string()]),
  probabilities: z.record(z.number()).optional(),
  confidence: z.number().optional(),
  legend: z.record(JsonValueSchema).optional(),
  /** Whether the answer crossed the question's threshold, decided when the judgment was made. */
  flagged: z.boolean().optional(),
  severity: z.string().optional(),
});
export type Judgment = z.infer<typeof JudgmentSchema>;

export const DecisionSchema = z.enum(['pass', 'flag', 'escalate', 'retry', 'block']);
export type Decision = z.infer<typeof DecisionSchema>;

/** One wrapper invocation: what was judged, what it cost, and what the policy decided. */
export const RecordSchema = z.object({
  id: z.string(),
  ts: z.string(),
  node: z.string(),
  promptVersion: z.string(),
  runId: z.string().optional(),
  stateHash: z.string(),
  model: z.string(),
  /** How long the judge took, summed over the requests one unit needed. */
  latencyMs: z.number(),
  /** How long the node itself took, when the wrapper ran it. */
  nodeLatencyMs: z.number().optional(),
  inputTokens: z.number(),
  costUSD: z.number(),
  judgments: z.array(JudgmentSchema),
  decision: DecisionSchema,
  panelId: z.string().optional(),
  panelVersion: z.string().optional(),
  /** Set when the judge could not be reached; the judgments are then empty and the node still ran. */
  error: z.string().optional(),
});

/**
 * One wrapper invocation. Exported as `Record`, which shadows TypeScript's own `Record<K, V>`
 * inside a file that imports it — `JevRecord` is the same type under a name that does not.
 */
export type Record = z.infer<typeof RecordSchema>;
export type JevRecord = z.infer<typeof RecordSchema>;

/** Human ground truth, joined to judgments on (node, stateHash, questionId, segmentIndex). */
export const LabelSchema = z.object({
  node: z.string(),
  stateHash: z.string(),
  questionId: z.string(),
  segmentIndex: z.number().int().min(0).optional(),
  /** noul: true means the condition holds. choice: the right label. score: the right level. */
  truth: z.union([z.boolean(), z.string(), z.number()]),
  /** Where the truth came from: a reviewer, a resolution table, an approved run. */
  source: z.string(),
  note: z.string().optional(),
});
export type Label = z.infer<typeof LabelSchema>;

/** Identity stamped onto every record the wrapper writes. */
export interface Identity {
  node: string;
  promptVersion: string;
  runId?: string;
}
