import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MODEL,
  JevAuthError,
  JevInvalidRequest,
  JevOverloaded,
  JevRateLimited,
  JevUnreachable,
  JevError,
  estimateCostUSD,
  fakeClient,
  fromSdkError,
  httpClient,
  parseJudgeBody,
  sdkClient,
  seededUnit,
  type FetchLike,
  type SdkLike,
} from '../src/core/client.js';
import { withSegment } from '../src/core/wire.js';

const ok = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });
const answer = { answers: { a: { type: 'noul', noul: 0.8 } }, model: 'jev-1.13.0', usage: { input_tokens: 1000, output_tokens: 0 } };

describe('pricing', () => {
  it('charges input tokens only', () => {
    expect(estimateCostUSD(1_000_000)).toBeCloseTo(0.042, 10);
    expect(estimateCostUSD(0)).toBe(0);
  });
});

describe('parseJudgeBody', () => {
  it('prefers a cost the endpoint reports', () => {
    const reported = parseJudgeBody({ ...answer, costUSD: 0.5 }, DEFAULT_MODEL, 10);
    expect(reported.costUSD).toBe(0.5);
    expect(reported.costReported).toBe(true);
    const local = parseJudgeBody(answer, DEFAULT_MODEL, 10);
    expect(local.costUSD).toBeCloseTo(estimateCostUSD(1000), 12);
    expect(local.costReported).toBe(false);
  });

  it('refuses a body with no answers', () => {
    expect(() => parseJudgeBody({ usage: {} }, DEFAULT_MODEL, 1)).toThrow(JevError);
  });
});

describe('httpClient', () => {
  it('posts the state, the model and the questions to the resolved path', async () => {
    let seen: { url: string; body: unknown; headers: Record<string, string> } | undefined;
    const fetchImpl: FetchLike = async (url, init) => {
      seen = { url: String(url), body: JSON.parse(String(init?.body)), headers: init?.headers as Record<string, string> };
      return ok(answer);
    };
    const client = httpClient({ baseUrl: 'https://gateway.example/typesafe', fetchImpl, apiKey: 'token-abc' });
    const result = await client.judge('a sentence', { a: { type: 'noul', instructions: 'Something is off here.' } });
    expect(seen?.url).toBe('https://gateway.example/typesafe/v1/systemone');
    expect(seen?.body).toEqual({ state: 'a sentence', model: DEFAULT_MODEL, questions: { a: { type: 'noul', instructions: 'Something is off here.' } } });
    expect(seen?.headers['authorization']).toContain('token-abc');
    expect(result.answers['a']?.noul).toBe(0.8);
  });

  it('takes headers from a function, for a rotating token', async () => {
    let calls = 0;
    const fetchImpl: FetchLike = async (_url, init) => {
      calls += 1;
      expect((init?.headers as Record<string, string>)['x-app']).toBe(`call-${calls}`);
      return ok(answer);
    };
    const client = httpClient({ baseUrl: 'https://gateway.example', fetchImpl, headers: () => ({ 'x-app': `call-${calls + 1}` }) });
    await client.judge('s', { a: { type: 'noul' } });
    await client.judge('s', { a: { type: 'noul' } });
    expect(calls).toBe(2);
  });

  it('retries a 429 after the delay the server asked for', async () => {
    const waits: number[] = [];
    let attempt = 0;
    const fetchImpl: FetchLike = async () => {
      attempt += 1;
      if (attempt === 1) return new Response('{}', { status: 429, headers: { 'retry-after': '2' } });
      return ok(answer);
    };
    const client = httpClient({ baseUrl: 'https://gateway.example', fetchImpl, sleep: async (ms) => void waits.push(ms) });
    const result = await client.judge('s', { a: { type: 'noul' } });
    expect(attempt).toBe(2);
    expect(waits).toEqual([2000]);
    expect(result.model).toBe('jev-1.13.0');
  });

  it('gives up on 429 once the retries are spent', async () => {
    const fetchImpl: FetchLike = async () => new Response('{}', { status: 429 });
    const client = httpClient({ baseUrl: 'https://gateway.example', fetchImpl, maxRetries: 1, sleep: async () => {} });
    await expect(client.judge('s', { a: { type: 'noul' } })).rejects.toBeInstanceOf(JevRateLimited);
  });

  it('retries an overloaded model', async () => {
    let attempt = 0;
    const fetchImpl: FetchLike = async () => {
      attempt += 1;
      return attempt === 1 ? new Response('{}', { status: 529 }) : ok(answer);
    };
    const client = httpClient({ baseUrl: 'https://gateway.example', fetchImpl, sleep: async () => {} });
    await client.judge('s', { a: { type: 'noul' } });
    expect(attempt).toBe(2);

    const always: FetchLike = async () => new Response('{}', { status: 529 });
    await expect(httpClient({ baseUrl: 'https://g.example', fetchImpl: always, maxRetries: 0 }).judge('s', { a: { type: 'noul' } })).rejects.toBeInstanceOf(JevOverloaded);
  });

  it('does not retry a refused key or a bad body', async () => {
    let calls = 0;
    const refuse = (status: number): FetchLike => async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: 'no' }), { status });
    };
    await expect(httpClient({ baseUrl: 'https://g.example', fetchImpl: refuse(401) }).judge('s', { a: { type: 'noul' } })).rejects.toBeInstanceOf(JevAuthError);
    await expect(httpClient({ baseUrl: 'https://g.example', fetchImpl: refuse(422) }).judge('s', { a: { type: 'noul' } })).rejects.toBeInstanceOf(JevInvalidRequest);
    expect(calls).toBe(2);
  });

  it('calls an upstream that never answered unreachable', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNREFUSED');
    };
    const client = httpClient({ baseUrl: 'https://g.example', fetchImpl, maxRetries: 0 });
    await expect(client.judge('s', { a: { type: 'noul' } })).rejects.toBeInstanceOf(JevUnreachable);
  });
});

describe('sdkClient', () => {
  it('wraps an injected client and prices the call locally', async () => {
    const calls: unknown[] = [];
    const stub: SdkLike = {
      async systemOne(request) {
        calls.push(request);
        return { model: 'jev-1.13.0', answers: { a: { type: 'noul', noul: 0.42 } }, usage: { input_tokens: 2_000_000, output_tokens: 0 } };
      },
    };
    const client = sdkClient({ client: stub });
    const result = await client.judge('state', { a: { type: 'noul', instructions: 'Is this off?' } });
    expect(result.answers['a']?.noul).toBe(0.42);
    expect(result.costUSD).toBeCloseTo(0.084, 10);
    expect(calls).toHaveLength(1);
  });

  it('maps the SDK errors onto its own', () => {
    expect(fromSdkError({ status: 401, message: 'bad key' })).toBeInstanceOf(JevAuthError);
    expect(fromSdkError({ status: 422, message: 'bad body' })).toBeInstanceOf(JevInvalidRequest);
    expect(fromSdkError({ status: 429, message: 'slow down', retryAfterMs: 1500 })).toBeInstanceOf(JevRateLimited);
    expect(fromSdkError({ status: 529, message: 'busy' })).toBeInstanceOf(JevOverloaded);
    expect(fromSdkError({ name: 'APITimeoutError', message: 'timed out' })).toBeInstanceOf(JevUnreachable);
    expect((fromSdkError({ status: 429, message: 'slow down', retryAfterMs: 1500 }) as JevRateLimited).retryAfterMs).toBe(1500);
  });

  it('throws through the adapter, not out of it', async () => {
    const stub: SdkLike = {
      async systemOne() {
        throw Object.assign(new Error('nope'), { status: 401 });
      },
    };
    await expect(sdkClient({ client: stub }).judge('s', { a: { type: 'noul' } })).rejects.toBeInstanceOf(JevAuthError);
  });
});

describe('fakeClient', () => {
  it('answers the same way twice', async () => {
    const client = fakeClient();
    const a = await client.judge('the invoice went out', { q: { type: 'noul', instructions: 'This is late.' } });
    const b = await client.judge('the invoice went out', { q: { type: 'noul', instructions: 'This is late.' } });
    expect(a.answers['q']?.noul).toBe(b.answers['q']?.noul);
    expect(await fakeClient({ seed: 'other' }).judge('the invoice went out', { q: { type: 'noul', instructions: 'This is late.' } }).then((r) => r.answers['q']?.noul)).not.toBe(a.answers['q']?.noul);
    expect(client.calls).toHaveLength(2);
    expect(a.costUSD).toBe(0);
  });

  it('takes a forced probability from the instructions', async () => {
    const client = fakeClient();
    const result = await client.judge('anything', { q: { type: 'noul', instructions: 'Whatever this is. jev:p=0.93' } });
    expect(result.answers['q']?.noul).toBe(0.93);
  });

  it('answers about the segment when the question carries one', async () => {
    const client = fakeClient();
    const questions = {
      'q#0': { type: 'noul' as const, instructions: withSegment('Does this mention the widget? jev:contains=widget', 0, 'We sell a widget.') as never },
      'q#1': { type: 'noul' as const, instructions: withSegment('Does this mention the widget? jev:contains=widget', 1, 'We also sell paint.') as never },
    };
    const result = await client.judge({ output: 'We sell a widget. We also sell paint.' }, questions);
    expect(result.answers['q#0']?.noul).toBe(0.95);
    expect(result.answers['q#1']?.noul).toBe(0.02);
  });

  it('answers a choice and a score from their criteria', async () => {
    const client = fakeClient();
    const result = await client.judge('a state', {
      pick: { type: 'choice', instructions: 'Which one? jev:choice=none', criteria: { past: 'past', none: 'neither' } },
      level: { type: 'score', instructions: 'How clear? jev:score=2', criteria: ['unclear', 'ok', 'clear'] },
    });
    expect(result.answers['pick']?.choice).toBe('none');
    expect(result.answers['pick']?.probabilities?.['none']).toBeGreaterThan(0.5);
    expect(result.answers['level']?.score).toBe(2);
    expect(result.answers['level']?.legend?.['2']).toBe('clear');
    expect(result.answers['level']?.confidence).toBeGreaterThan(0);
  });

  it('throws the error a sentinel asks for', async () => {
    const client = fakeClient();
    await expect(client.judge('s', { q: { type: 'noul', instructions: 'jev:error=429' } })).rejects.toBeInstanceOf(JevRateLimited);
    await expect(client.judge('a state saying jev:error=401', { q: { type: 'noul', instructions: 'fine' } })).rejects.toBeInstanceOf(JevAuthError);
    await expect(client.judge('s', { q: { type: 'noul', instructions: 'jev:error=timeout' } })).rejects.toBeInstanceOf(JevUnreachable);
  });

  it('seeds a unit interval from a hash', () => {
    const value = seededUnit('a', 'b');
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(seededUnit('a', 'b')).toBe(value);
    expect(seededUnit('a', 'c')).not.toBe(value);
  });
});
