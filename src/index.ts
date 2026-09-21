// Jevidence: measure an agent or a prompt by asking a typed panel of questions about what it
// produced, record every answer, and calibrate the questions against what a human said.

export {
  // schema
  JsonValueSchema,
  QuestionTypeSchema,
  SpanSchema,
  NoulQuestionSchema,
  ChoiceQuestionSchema,
  ScoreQuestionSchema,
  QuestionSchema,
  SegmentModeSchema,
  StateModeSchema,
  PanelSchema,
  JudgmentSchema,
  DecisionSchema,
  RecordSchema,
  LabelSchema,
} from './core/types.js';
export type {
  JsonValue,
  JevState,
  QuestionType,
  Span,
  NoulQuestion,
  ChoiceQuestion,
  ScoreQuestion,
  Question,
  SegmentMode,
  StateMode,
  StateBuilder,
  Panel,
  PanelJson,
  Judgment,
  Decision,
  Record,
  JevRecord,
  Label,
  Identity,
} from './core/types.js';

export {
  DEFAULT_MODEL,
  LATEST_MODEL,
  INPUT_PRICE_PER_TOKEN_USD,
  SENTINEL,
  estimateCostUSD,
  parseJudgeBody,
  seededUnit,
  fromSdkError,
  httpClient,
  sdkClient,
  fakeClient,
  JevError,
  JevAuthError,
  JevInvalidRequest,
  JevRateLimited,
  JevOverloaded,
  JevUnreachable,
  JevSdkMissing,
} from './core/client.js';
export type {
  JevClient,
  JevAnswer,
  JevUsage,
  JudgeResult,
  JudgeOptions,
  WireQuestion,
  WireQuestions,
  FetchLike,
  HttpClientOptions,
  SdkClientOptions,
  SdkLike,
  FakeClient,
  FakeClientOptions,
  FakeCall,
} from './core/client.js';

export { CHARS_PER_TOKEN, MAX_REQUEST_TOKENS, MAX_STATE_TOKENS, BudgetExceeded, estimateTokens, planChunks } from './core/budget.js';
export type { BudgetLimits } from './core/budget.js';

export { hashState, stableStringify, stateText } from './core/hash.js';

export { loadPanel, parsePanel, validatePanel, panelToJSON, lintPanel, lintErrors, questionThreshold, toWireQuestion, toWireQuestions, isStateBuilder, PanelError } from './core/panel.js';
export type { LintIssue, PanelValidation } from './core/panel.js';

export { segment, splitSentences, splitParagraphs, wholeText, spanOf } from './core/segment.js';
export type { SentenceOptions } from './core/segment.js';

export { segmentedId, parseQuestionId, withSegment, segmentOfInstructions } from './core/wire.js';
export type { SegmentedInstructions } from './core/wire.js';

export { measure, runPanel, thresholdsOf, asJson, defaultOutputText, Blocked } from './core/measure.js';
export type { MeasureOptions, NodeFn, PanelRun, RunPanelOptions } from './core/measure.js';

export { DECISION_ORDER, crossesThreshold, applyThresholds, flaggedOf, decide, escalate, defaultRetryInput, strongest } from './core/policy.js';
export type { Policy, PolicyOutcome, EscalationContext, EscalationHandler, RetryInputBuilder } from './core/policy.js';

export { memoryLedger, jsonlLedger, filterRecords, matchesQuery, parseRecords, readRecords, writeRecords } from './core/ledger.js';
export type { Ledger, LedgerQuery, MemoryLedger } from './core/ledger.js';

export { replay, readDataset } from './core/replay.js';
export type { ReplayItem, ReplayOptions, ReplayResult } from './core/replay.js';

export { calibrate, calibrationMarkdown, joinLabels } from './core/calibrate.js';
export type { CalibrateOptions, CalibrationReport, QuestionCalibration, ReliabilityBin, SweepPoint, Grade, Pair } from './core/calibrate.js';

export { report, reportMarkdown } from './core/report.js';
export type { ReportOptions, ReportResult, GroupReport, QuestionSummary, LatencySummary, Drift, QuestionDrift } from './core/report.js';
