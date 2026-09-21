// The judge. One interface, three adapters: the TypeSafe SDK, any /v1/systemone-compatible
// endpoint (this is the one a gateway fronts), and a deterministic fake for tests.
import { estimateTokens } from './budget.js';
import { sha256, stableStringify, stateText } from './hash.js';
import type { JevState, JsonValue, QuestionType } from './types.js';
import { segmentOfInstructions } from './wire.js';

export const DEFAULT_MODEL = 'jev-1.13.0';
export const LATEST_MODEL = 'jev-latest';
/** $0.042 per million input tokens; output is free. */
export const INPUT_PRICE_PER_TOKEN_USD = 0.042 / 1_000_000;

export function estimateCostUSD(inputTokens: number): number {
  return inputTokens * INPUT_PRICE_PER_TOKEN_USD;
}

/** A question in the shape the endpoint takes. Jevidence's own additions are stripped first. */
export interface WireQuestion {
  type: QuestionType;
  instructions?: JsonValue;
  criteria?: JsonValue;
}
export interface WireQuestions {
  [id: string]: WireQuestion;
}

/** One answer as the endpoint returns it. A noul answer carries no confidence. */
export interface JevAnswer {
  type: QuestionType;
  noul?: number;
  choice?: string;
  score?: number;
  probabilities?: { [key: string]: number };
  legend?: { [key: string]: JsonValue };
  confidence?: number;
}

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JudgeResult {
  answers: { [id: string]: JevAnswer };
  model: string;
  usage: JevUsage;
  /** What the endpoint charged, when it says. Otherwise the local estimate. */
  costUSD: number;
  /** True when `costUSD` came from the endpoint rather than the local price table. */
  costReported?: boolean;
  latencyMs: number;
}

export interface JudgeOptions {
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Everything in Jevidence that asks Jev a question goes through this. */
export interface JevClient {
  judge(state: JevState, questions: WireQuestions, opts?: JudgeOptions): Promise<JudgeResult>;
}

// ---------------------------------------------------------------------------
// Errors. One class per thing a caller can do about it.
// ---------------------------------------------------------------------------

export class JevError extends Error {
  override name = 'JevError';
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}
/** 401: the key is missing, wrong, or not yet activated. */
export class JevAuthError extends JevError {
  override name = 'JevAuthError';
}
/** 422: the request is malformed, usually a question the endpoint will not take. */
export class JevInvalidRequest extends JevError {
  override name = 'JevInvalidRequest';
}
/** 429: too many requests. `retryAfterMs` is the server's own advice when it gave any. */
export class JevRateLimited extends JevError {
  override name = 'JevRateLimited';
  constructor(
    message: string,
    readonly retryAfterMs?: number,
    body?: unknown,
  ) {
    super(message, 429, body);
  }
}
/** 529: the model is overloaded. Retryable. */
export class JevOverloaded extends JevError {
  override name = 'JevOverloaded';
  constructor(message: string, body?: unknown) {
    super(message, 529, body);
  }
}
/** Nothing answered: DNS, a refused connection, or a timeout. */
export class JevUnreachable extends JevError {
  override name = 'JevUnreachable';
  constructor(
    readonly upstream: string,
    readonly reason: 'timeout' | 'network',
  ) {
    super(`${upstream} unreachable (${reason})`);
  }
}
/** The optional peer is not installed. */
export class JevSdkMissing extends JevError {
  override name = 'JevSdkMissing';
  constructor(cause?: unknown) {
    super('sdkClient needs the optional peer @typesafe-ai/sdk - install it, or use httpClient({ baseUrl })');
    this.cause = cause;
  }
}

// ---------------------------------------------------------------------------
// httpClient - any /v1/systemone-compatible endpoint, including a gateway.
// ---------------------------------------------------------------------------

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  /** Root of the endpoint. `path` resolves against it, so a base with a prefix keeps the prefix. */
  baseUrl: string;
  /** Default `v1/systemone`, relative to `baseUrl`. */
  path?: string;
  /** Sent on every request. A function is called per request, so a rotating token works. */
  headers?: { [key: string]: string } | (() => { [key: string]: string } | Promise<{ [key: string]: string }>);
  /** Shorthand for a bearer authorization header. */
  apiKey?: string;
  fetchImpl?: FetchLike;
  model?: string;
  timeoutMs?: number;
  /** Retries after the first attempt, for 429, 529 and an upstream that did not answer. Default 2. */
  maxRetries?: number;
  /** First backoff, doubled each attempt. Default 500ms. */
  backoffMs?: number;
  /** Injected in tests so a retry does not really wait. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected in tests so latency is not the wall clock. */
  now?: () => number;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function retryAfterMs(headers: Headers): number | undefined {
  const ms = headers.get('retry-after-ms');
  if (ms && Number.isFinite(Number(ms))) return Number(ms);
  const after = headers.get('retry-after');
  if (!after) return undefined;
  if (Number.isFinite(Number(after))) return Number(after) * 1000;
  const at = Date.parse(after);
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Turn a parsed body into a JudgeResult, whatever extra fields the endpoint added. */
export function parseJudgeBody(body: unknown, fallbackModel: string, latencyMs: number): JudgeResult {
  const b = (body ?? {}) as { answers?: unknown; model?: unknown; usage?: unknown; costUSD?: unknown; cost_usd?: unknown };
  if (typeof b.answers !== 'object' || b.answers === null) {
    throw new JevError('the endpoint answered without an `answers` object', undefined, body);
  }
  const answers = b.answers as { [id: string]: JevAnswer };
  const usageRaw = (b.usage ?? {}) as { input_tokens?: unknown; output_tokens?: unknown };
  const usage: JevUsage = { input_tokens: asNumber(usageRaw.input_tokens) ?? 0, output_tokens: asNumber(usageRaw.output_tokens) ?? 0 };
  const reported = asNumber(b.costUSD) ?? asNumber(b.cost_usd);
  return {
    answers,
    model: typeof b.model === 'string' ? b.model : fallbackModel,
    usage,
    costUSD: reported ?? estimateCostUSD(usage.input_tokens),
    costReported: reported !== undefined,
    latencyMs,
  };
}

export function httpClient(options: HttpClientOptions): JevClient {
  const {
    baseUrl,
    path = 'v1/systemone',
    fetchImpl,
    model: defaultModel = DEFAULT_MODEL,
    timeoutMs = 30_000,
    maxRetries = 2,
    backoffMs = 500,
    sleep = wait,
    now = () => Date.now(),
  } = options;
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  return {
    async judge(state, questions, opts) {
      const doFetch = fetchImpl ?? (globalThis.fetch as FetchLike);
      const model = opts?.model ?? defaultModel;
      const body = JSON.stringify({ state, model, questions });
      const extra = typeof options.headers === 'function' ? await options.headers() : (options.headers ?? {});
      const headers: { [key: string]: string } = { 'content-type': 'application/json', accept: 'application/json', ...extra };
      if (options.apiKey && headers['authorization'] === undefined && headers['Authorization'] === undefined) {
        headers['authorization'] = `Bearer ${options.apiKey}`;
      }

      let attempt = 0;
      for (;;) {
        const started = now();
        const timeout = AbortSignal.timeout(opts?.timeoutMs ?? timeoutMs);
        const signal = opts?.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
        let response: Response;
        try {
          response = await doFetch(url, { method: 'POST', headers, body, signal, redirect: 'manual' });
        } catch {
          const err = new JevUnreachable(url.host, timeout.aborted ? 'timeout' : 'network');
          if (attempt >= maxRetries) throw err;
          attempt += 1;
          await sleep(backoffMs * 2 ** (attempt - 1));
          continue;
        }
        const latencyMs = now() - started;
        if (response.ok) return parseJudgeBody(await readJson(response), model, latencyMs);

        const parsed = await readJson(response);
        if (response.status === 401 || response.status === 403) throw new JevAuthError('the endpoint refused the key', response.status, parsed);
        if (response.status === 422 || response.status === 400) throw new JevInvalidRequest('the endpoint rejected the request body', response.status, parsed);
        if (response.status === 429 || response.status === 529 || response.status >= 500) {
          const after = retryAfterMs(response.headers);
          const err =
            response.status === 429
              ? new JevRateLimited('the endpoint is rate limiting', after, parsed)
              : response.status === 529
                ? new JevOverloaded('the model is overloaded', parsed)
                : new JevError(`the endpoint answered ${response.status}`, response.status, parsed);
          if (attempt >= maxRetries) throw err;
          attempt += 1;
          await sleep(after ?? backoffMs * 2 ** (attempt - 1));
          continue;
        }
        throw new JevError(`the endpoint answered ${response.status}`, response.status, parsed);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// sdkClient - the optional peer, imported lazily so the core runs without it.
// ---------------------------------------------------------------------------

/** The slice of the TypeSafe SDK Jevidence uses, restated so `dist` does not need the peer's types. */
export interface SdkLike {
  systemOne(
    request: { state: unknown; questions: unknown; model?: string },
    options?: { signal?: AbortSignal; timeout?: number },
  ): Promise<{ model: string; answers: { [id: string]: JevAnswer }; usage: JevUsage }>;
}

export interface SdkClientOptions {
  apiKey?: string;
  baseURL?: string;
  defaultModel?: string;
  timeout?: number;
  retry?: { [key: string]: unknown };
  fetch?: FetchLike;
  /** An already-built client, or a stub in tests. When given, nothing is imported. */
  client?: SdkLike;
  now?: () => number;
}

/** Map an SDK error onto Jevidence's own, by the status it carries. */
export function fromSdkError(error: unknown): Error {
  const e = error as { status?: number; retryAfterMs?: number; message?: string; name?: string; body?: unknown };
  const message = e?.message ?? 'the SDK failed';
  if (e?.status === 401 || e?.status === 403) return new JevAuthError(message, e.status, e.body);
  if (e?.status === 422 || e?.status === 400) return new JevInvalidRequest(message, e.status, e.body);
  if (e?.status === 429) return new JevRateLimited(message, e.retryAfterMs, e.body);
  if (e?.status === 529) return new JevOverloaded(message, e.body);
  if (typeof e?.status === 'number') return new JevError(message, e.status, e.body);
  if (e?.name === 'APITimeoutError') return new JevUnreachable('api.typesafe.ai', 'timeout');
  if (e?.name === 'APIConnectionError') return new JevUnreachable('api.typesafe.ai', 'network');
  return error instanceof Error ? error : new JevError(message);
}

export function sdkClient(options: SdkClientOptions = {}): JevClient {
  const { defaultModel = DEFAULT_MODEL, now = () => Date.now() } = options;
  let pending: Promise<SdkLike> | undefined;

  const resolve = async (): Promise<SdkLike> => {
    if (options.client) return options.client;
    pending ??= (async () => {
      // A variable specifier: the peer is resolved at run time, and its absence is an error a
      // caller can read rather than a module a bundler insists on.
      const specifier = '@typesafe-ai/sdk';
      let mod: { TypeSafeClient: new (config: unknown) => SdkLike };
      try {
        mod = (await import(specifier)) as { TypeSafeClient: new (config: unknown) => SdkLike };
      } catch (cause) {
        throw new JevSdkMissing(cause);
      }
      const config: { [key: string]: unknown } = { defaultModel };
      if (options.apiKey !== undefined) config['apiKey'] = options.apiKey;
      if (options.baseURL !== undefined) config['baseURL'] = options.baseURL;
      if (options.timeout !== undefined) config['timeout'] = options.timeout;
      if (options.retry !== undefined) config['retry'] = options.retry;
      if (options.fetch !== undefined) config['fetch'] = options.fetch;
      return new mod.TypeSafeClient(config);
    })();
    return pending;
  };

  return {
    async judge(state, questions, opts) {
      const client = await resolve();
      const model = opts?.model ?? defaultModel;
      const started = now();
      try {
        const request: { state: unknown; questions: unknown; model?: string } = { state, questions, model };
        const callOpts: { signal?: AbortSignal; timeout?: number } = {};
        if (opts?.signal) callOpts.signal = opts.signal;
        if (opts?.timeoutMs) callOpts.timeout = opts.timeoutMs;
        const result = await client.systemOne(request, callOpts);
        const usage: JevUsage = { input_tokens: result.usage?.input_tokens ?? 0, output_tokens: result.usage?.output_tokens ?? 0 };
        return {
          answers: result.answers ?? {},
          model: result.model ?? model,
          usage,
          costUSD: estimateCostUSD(usage.input_tokens),
          costReported: false,
          latencyMs: now() - started,
        };
      } catch (error) {
        throw fromSdkError(error);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// fakeClient - deterministic, free, and steerable from the instructions.
// ---------------------------------------------------------------------------

/** Force a probability, a level or a label: put one of these in a question's instructions. */
export const SENTINEL = {
  /** `jev:p=0.93` - a noul answers 0.93 exactly. */
  probability: /jev:p=([01](?:\.\d+)?)/,
  /** `jev:score=3` - a score answers level 3. */
  score: /jev:score=(\d+)/,
  /** `jev:choice=none` - a choice answers that label. */
  choice: /jev:choice=([A-Za-z0-9_.:-]+)/,
  /** `jev:confidence=0.4` - choice and score answer with that confidence. */
  confidence: /jev:confidence=([01](?:\.\d+)?)/,
  /** `jev:contains=widget` - a noul answers 0.95 when the state holds the word, else 0.02. */
  contains: /jev:contains=([A-Za-z0-9_-]+)/,
  /** `jev:error=429` - the client throws instead of answering. Also read from the state. */
  error: /jev:error=(\d{3}|network|timeout)/,
} as const;

export interface FakeCall {
  state: JevState;
  questions: WireQuestions;
  model: string;
}

export interface FakeClientOptions {
  model?: string;
  /** Changes every hash-seeded answer, so a test can ask for a different world. */
  seed?: string;
  /** Reported as the call's latency; the fake never really waits. */
  latencyMs?: number;
  /** Report a costUSD the way a gateway does, instead of leaving it to the local estimate. */
  reportCost?: boolean;
}

export interface FakeClient extends JevClient {
  /** Every call made, in order. */
  readonly calls: FakeCall[];
}

/** A number in [0,1) from a hash, so the same question about the same state always answers the same. */
export function seededUnit(...parts: string[]): number {
  return parseInt(sha256(parts.join('|')).slice(0, 8), 16) / 0x1_0000_0000;
}

function instructionText(q: WireQuestion): string {
  return typeof q.instructions === 'string' ? q.instructions : stableStringify(q.instructions ?? null);
}

function errorFor(code: string): Error {
  if (code === 'network' || code === 'timeout') return new JevUnreachable('fake', code);
  if (code === '401') return new JevAuthError('fake client: the key sentinel', 401);
  if (code === '422') return new JevInvalidRequest('fake client: the body sentinel', 422);
  if (code === '429') return new JevRateLimited('fake client: the rate sentinel', 1000);
  if (code === '529') return new JevOverloaded('fake client: the overload sentinel');
  return new JevError(`fake client: the ${code} sentinel`, Number(code));
}

export function fakeClient(options: FakeClientOptions = {}): FakeClient {
  const { model = DEFAULT_MODEL, seed = 'jevidence', latencyMs = 12, reportCost = false } = options;
  const calls: FakeCall[] = [];

  return {
    calls,
    async judge(state, questions, opts) {
      const text = stateText(state);
      const answeredModel = opts?.model ?? model;
      calls.push({ state, questions, model: answeredModel });

      const stateError = SENTINEL.error.exec(text);
      if (stateError?.[1]) throw errorFor(stateError[1]);

      const answers: { [id: string]: JevAnswer } = {};
      for (const [id, q] of Object.entries(questions)) {
        const instructions = instructionText(q);
        const forcedError = SENTINEL.error.exec(instructions);
        if (forcedError?.[1]) throw errorFor(forcedError[1]);
        // What a real judge would answer about: the segment when the question carries one,
        // the whole state when it does not.
        const subject = segmentOfInstructions(q.instructions)?.text ?? text;
        const unit = seededUnit(seed, subject, id, instructions);
        const confidence = Number(SENTINEL.confidence.exec(instructions)?.[1] ?? (0.5 + unit / 2).toFixed(4));

        if (q.type === 'noul') {
          const forced = SENTINEL.probability.exec(instructions)?.[1];
          const contains = SENTINEL.contains.exec(instructions)?.[1];
          const noul =
            forced !== undefined
              ? Number(forced)
              : contains !== undefined
                ? subject.toLowerCase().includes(contains.toLowerCase())
                  ? 0.95
                  : 0.02
                : Number(unit.toFixed(4));
          answers[id] = { type: 'noul', noul };
          continue;
        }
        if (q.type === 'choice') {
          const labels = Object.keys((q.criteria ?? {}) as { [key: string]: unknown });
          const forced = SENTINEL.choice.exec(instructions)?.[1];
          const picked = forced && labels.includes(forced) ? forced : (labels[Math.floor(unit * labels.length)] ?? 'unknown');
          const probabilities: { [key: string]: number } = {};
          const rest = labels.length > 1 ? (1 - confidence) / (labels.length - 1) : 0;
          for (const label of labels) probabilities[label] = label === picked ? confidence : rest;
          answers[id] = { type: 'choice', choice: picked, probabilities, confidence };
          continue;
        }
        const levels = Array.isArray(q.criteria) ? q.criteria.length : 2;
        const forced = SENTINEL.score.exec(instructions)?.[1];
        const level = forced !== undefined ? Math.min(Number(forced), levels - 1) : Math.floor(unit * levels);
        const probabilities: { [key: string]: number } = {};
        const rest = levels > 1 ? (1 - confidence) / (levels - 1) : 0;
        const legend: { [key: string]: JsonValue } = {};
        for (let i = 0; i < levels; i++) {
          probabilities[String(i)] = i === level ? confidence : rest;
          legend[String(i)] = (Array.isArray(q.criteria) ? (q.criteria[i] as JsonValue) : null) ?? null;
        }
        answers[id] = { type: 'score', score: level, probabilities, legend, confidence };
      }

      const input_tokens = estimateTokens(text) + estimateTokens(stableStringify(questions));
      return {
        answers,
        model: answeredModel,
        usage: { input_tokens, output_tokens: 0 },
        costUSD: 0,
        costReported: reportCost,
        latencyMs,
      };
    },
  };
}
