# jevidence

You have an LLM step in production — a drafter, a classifier, an agent deciding which tool to
call — and you want to know whether what it produced is any good. Not on a benchmark, on every
call. The usual answer is an LLM judge, and the usual problem is that nobody ever checks the
judge. jevidence does both halves. It wraps the step, asks a fixed panel of typed questions
about the output, writes every answer to a ledger with its cost and latency, replays the same
panel over old output when you change the prompt, and scores the panel's answers against the
verdicts your reviewers actually gave — so you find out which questions are worth trusting
before you let one of them block anything.

The judge is [Jev](https://typesafe.ai), TypeSafe AI's decision model. It does not write prose.
You send it a state and a map of typed questions; it sends back one typed answer each — a
probability for a yes/no, a label for a choice, a level for a score. A panel of five yes/no
questions over a 400-word passage costs about **$0.0005** and answers in **250–700 ms**, measured
through a gateway in front of the API. At that price you can judge every call rather than a
sample: a thousand drafts a day costs about $0.50 a day to measure.

## Install

```bash
npm install jevidence
```

Node 22 or newer, ESM only. The one runtime dependency is `zod`. To talk to TypeSafe directly,
add their SDK — it is an optional peer, and everything except `sdkClient()` works without it:

```bash
npm install @typesafe-ai/sdk
```

## The idea in one screen

One request carries a **state** and a map of **questions**. The state is the thing being judged,
shared by every question in the request. Each question is one of three types:

- **noul** — a yes/no statement. The answer is the probability that it is true: `0.93`, not
  "probably". Thresholds and calibration are possible because of this.
- **choice** — pick one of 2 to 255 labels. The answer is the label plus a probability for each.
- **score** — place it on an ordered scale of 2 to 10 described levels. The answer is a
  probability-weighted level.

jevidence adds four things on top. A **panel** is a versioned JSON file of questions you check
into your repo. **Segmentation** cuts the output into sentences or paragraphs in your code, not
the model's, so every answer arrives carrying the exact span it is about. A **threshold** per
question turns a probability into a flag. A **ledger** keeps every record, which is what makes
replay, drift and calibration possible later.

Put the shared context in the state, once, and let the questions refer to it. Repeating context
inside each question's instructions is the single expensive mistake here — see
[What it costs](#what-it-costs).

## Wrap a function

`measure()` returns a function with your function's exact signature. It runs the node, judges the
output, writes a record, and hands you back the same value your function returned. With no
`policy`, that is all it does — it observes.

```ts
import { measure, parsePanel, httpClient, jsonlLedger } from 'jevidence';

const panel = parsePanel({
  id: 'draft-review',
  version: '1',
  segment: 'sentence',
  state: 'input+output',
  questions: {
    'claim-outside-brief': {
      type: 'noul',
      severity: 'hard',
      threshold: 0.7,
      instructions: 'This sentence makes a factual claim that nothing in the research brief supports.',
      criteria: {
        true: 'The sentence asserts something about the world that the brief in `input.brief` does not contain.',
        false: 'Everything the sentence asserts is in the brief, or the sentence asserts nothing.',
      },
    },
    'figure-uncited': {
      type: 'noul',
      severity: 'hard',
      threshold: 0.7,
      instructions: 'This sentence gives a number that no bracketed citation marker supports.',
      criteria: {
        true: 'A figure, percentage, money amount or count appears with no bracketed marker such as [3] on the sentence.',
        false: 'The sentence has no figure, or every figure sits in a sentence carrying a marker.',
      },
    },
    'jargon-term': {
      type: 'noul',
      severity: 'advisory',
      threshold: 0.6,
      instructions: 'This sentence uses a term that the owner of a small business would not recognise.',
    },
    'heading-answered': {
      type: 'noul',
      per: 'unit',
      severity: 'advisory',
      threshold: 0.6,
      instructions: 'The opening sentence of this section leaves the question in `input.heading` unanswered.',
    },
  },
});

async function draftSection(input: { heading: string; brief: string }): Promise<string> {
  return callYourWritingModel(input);
}

const measured = measure(draftSection, panel, {
  client: httpClient({ baseUrl: 'https://api.typesafe.ai', apiKey: process.env.TYPESAFE_API_KEY }),
  ledger: jsonlLedger('.jevidence/records.jsonl'),
  identity: { node: 'draft-section', promptVersion: 'v3' },
});

const section = await measured({ heading: 'Why do invoices get paid late?', brief });
```

`section` is a string, exactly what `draftSection` returned. One line lands in
`.jevidence/records.jsonl`. For a three-sentence draft that is ten judgments — three segmented
questions × three sentences, plus the one `per: "unit"` question — in a single request, because
every question that shares a state is fanned out into the same call:

```jsonc
{
  "id": "60416631-157a-438a-8947-bdc4303ebc9b",
  "ts": "...",
  "node": "draft-section", "promptVersion": "v3",
  "stateHash": "529af6f6e074e704...", "model": "jev-1.13.0",
  "latencyMs": 412, "nodeLatencyMs": 3180, "inputTokens": 1027, "costUSD": 0.000043,
  "judgments": [
    { "questionId": "claim-outside-brief", "type": "noul", "answer": 0.41, "segmentIndex": 0,
      "span": { "start": 0, "end": 73, "text": "Late payment is the single largest cash-flow problem for small firms [2]." },
      "severity": "hard", "flagged": false },
    { "questionId": "figure-uncited", "type": "noul", "answer": 0.91, "segmentIndex": 1,
      "span": { "start": 73, "end": 126, "text": "Around 52% of invoices are paid after their due date." },
      "severity": "hard", "flagged": true },
    { "questionId": "heading-answered", "type": "noul", "answer": 0.22, "severity": "advisory", "flagged": false }
    // ... seven more
  ],
  "decision": "flag",
  "panelId": "draft-review", "panelVersion": "1"
}
```

Every judgment carries its own span, so a finding quotes the text verbatim without the model
having to quote itself correctly. `nodeLatencyMs` is your function; `latencyMs` is the judge,
summed over however many requests the panel needed.

If the judge is unreachable, the record is written with an `error` field and empty `judgments`,
and your function's result still comes back. Pass `tolerateJudgeErrors: false` to have the error
thrown instead.

## Panels are JSON

A panel is an id, a version, how to cut the output, how to build the state, and the questions.
Check it into the repo, so a change to what you measure shows up in a diff and in the
`panelVersion` on every record. This is one question from the shipped `panels/seo-review.json`:

```json
{
  "claim-outside-brief": {
    "type": "noul",
    "per": "segment",
    "severity": "hard",
    "threshold": 0.7,
    "instructions": "This sentence makes a factual claim that nothing in the research brief supports.",
    "criteria": {
      "true": "The sentence asserts something about the world that the brief in the state does not contain.",
      "false": "Everything the sentence asserts is in the brief, is a definition of a term the brief uses, or is a transition that asserts nothing."
    }
  }
}
```

`segment` is `sentence`, `paragraph` or `none`. `state` is `input+output` or `output`, or a
function you pass in code. `per: "unit"` asks a question once about the whole text rather than
about each segment, so one panel can mix "is this sentence uncited" with "does the opening answer
the heading". `threshold` and `severity` are jevidence's; they never reach the model. Neither
does the question id — instructions have to stand on their own.

`loadPanel(path)` reads and validates one. `lintPanel(panel)` catches the four habits that make a
typed question answer badly:

```bash
jevidence lint-panel panels/*.json
```

- a noul whose instructions join two conditions with "and" or "or" (split it into two nouls)
- a score with more than ten levels, or a choice with fewer than two
- a choice with no option meaning "none of these", so the model has to pick something
- instructions under four words, which only make sense next to the id the model never sees

Three panels ship with the package: `seo-review` (six questions over article prose),
`brief-check` (citation and sourcing errors, line by line) and `generic-quality` (four questions
worth asking of almost any generated answer). Copy one and edit it.

## Policies

A policy turns flags into behaviour. Without one, `measure` never changes what your code does.
Five actions, weakest to strongest: `pass`, `flag`, `escalate`, `retry`, `block`. A call takes
the strongest action any flagged judgment asks for.

Here the hard question blocks, the advisory ones only flag, and a prose model writes the reason
for whatever got blocked:

```ts
import { measure, Blocked } from 'jevidence';

const measured = measure(draftSection, panel, {
  client,
  ledger,
  identity: { node: 'draft-section', promptVersion: 'v3' },
  policy: {
    action: 'flag',
    perQuestion: { 'claim-outside-brief': 'block' },
    perSeverity: { advisory: 'flag' },
  },
});

try {
  return await measured({ heading, brief });
} catch (error) {
  if (!(error instanceof Blocked)) throw error;

  // The record is already in the ledger. Each flagged judgment carries the sentence it is about,
  // so the expensive model is asked one narrow question instead of re-reading the draft.
  const flagged = error.record.judgments.filter((j) => j.flagged);
  const why = await writeReason({
    brief,
    problems: flagged.map((j) => ({ question: j.questionId, sentence: j.span?.text })),
  });
  return await retryWithFeedback(why);
}
```

The `> 0.7` lives in the panel, not here: `claim-outside-brief` has `threshold: 0.7`, and
`flagged` is stamped on the judgment at the moment it is made, so a record read back months later
still says what it was measured against.

Two other shapes:

```ts
import { escalate } from 'jevidence';

// Let the call through, but hand the flagged judgments to a prose model that writes the reason.
policy: escalate(async ({ flagged, state }) => { await explainAndFile(flagged, state); });

// Re-run the node with the flagged sentences appended to its input, at most twice.
policy: { action: 'retry', maxRetries: 2 };
```

`retry` appends the flagged judgments to the node's last argument — a paragraph for a string
argument, a `jevidence` field for an object. Pass `retryInput` to build the retry yourself. When
the retries run out, the call is recorded as `flag` and the last output is returned.

## Ledger

`Ledger` is two methods:

```ts
interface Ledger {
  append(record: JevRecord): Promise<void>;
  query(query?: LedgerQuery): Promise<JevRecord[]>;
}
```

`jsonlLedger(path)` writes one JSON object per line, which `jq` reads and `git diff` shows.
`memoryLedger()` keeps them in an array with a `.records` field, for tests. A Postgres-backed one
is about fifteen lines — implement the interface, nothing here is a base class.

`query()` filters on node, promptVersion, runId, decision, panelId, a `since`/`until` window and
a limit. `readRecords(path)`, `writeRecords(path, records)` and `parseRecords(text)` are exported
for the times you want the array rather than the interface, and every record is validated against
the schema on the way in.

## Replay

You changed the prompt. You do not want to pay for the expensive model twice to find out whether
the change helped, and you cannot compare against last month's output unless you judge it with
the same panel. `replay()` runs a panel over output you already have, with no node:

```ts
import { replay, report, loadPanel, httpClient, jsonlLedger, readRecords } from 'jevidence';

const panel = await loadPanel('panels/seo-review.json');
const client = httpClient({ baseUrl: 'https://your-gateway.example' });

// Each line: { id, node, input, output, meta? }. An item's own node/promptVersion wins over identity.
const after = await replay(panel, 'runs/last-month.jsonl', client, {
  ledger: jsonlLedger('.jevidence/replay-v4.jsonl'),
  identity: { promptVersion: 'v4' },
  concurrency: 4,
});

console.log(after.records.length, after.requests, after.costUSD, after.skipped);

const before = await readRecords('.jevidence/records.jsonl');
const { drift, markdown } = report([...before, ...after.records], { compare: ['v3', 'v4'] });
```

`drift` is per node: the flagged rate for each question before and after, the change in mean
probability, the change in cost per record and in judge latency. `markdown` is the same thing as
a table you can paste into a pull request.

```
## Drift — draft-section: v3 to v4

Cost per record +$0.000004, judge latency +18ms.

| question | flagged before | flagged after | change |
|---|---|---|---|
| `claim-outside-brief` | 31% | 12% | -19pp |
| `figure-uncited` | 22% | 21% | -1pp |
| `jargon-term` | 8% | 19% | +11pp |
```

An item that carries neither an `output` nor a `state` is listed in `skipped` with the reason,
never silently dropped. The same is true one level down: if the judge answers fewer questions
than were asked, `runPanel` throws and names the ones with no answer.

## Calibrate

The drift table above says the flagged rate moved. It does not say the flags were right. That is
a separate question and it needs human labels — join them on
`(node, stateHash, questionId, segmentIndex)`, which means your review tool has to store the
`stateHash` from the record:

```ts
import { calibrate, calibrationMarkdown, type Label } from 'jevidence';

const labels: Label[] = reviewRows.map((row) => ({
  node: 'draft-section',
  stateHash: row.stateHash,
  questionId: row.questionId,
  segmentIndex: row.sentenceIndex,
  truth: row.reviewerSaidItWasWrong,   // boolean for a noul, the label for a choice, the level for a score
  source: 'editorial-review',
}));

const cal = calibrate(await readRecords('.jevidence/records.jsonl'), labels, {
  panel,
  targetPrecision: 0.9,
  minSamples: 10,
});

for (const q of cal.questions) console.log(q.questionId, q.grade, q.reason);
console.log(calibrationMarkdown(cal));
```

Per question you get precision and recall at the panel's own threshold, a Brier score, reliability
bins with their expected calibration error, a sweep over thresholds from 0.05 to 0.95, and a
grade:

- **trust** — precision is at or above your target with recall above the floor. Gate on it.
- **tune** — some threshold reaches your target. `recommendedThreshold` is the one that keeps the
  most recall while doing it.
- **drop** — no threshold reaches your target with usable recall. The question does not work.
  Rewrite it or delete it.

Fewer than `minSamples` labels is never `trust`, however good the numbers look.

Worth saying plainly: the first time this was run against three real editorial runs, the panel's
flags did not track the humans' verdicts. The best precision any question reached at any
threshold was **0.57**, against a **45%** base rate — barely better than flagging at random —
and two questions graded `drop`. Had those flags been wired to `block` on the strength of a few
spot checks, the pipeline would have been rejecting drafts on a coin flip. Finding that out from
a table took one replay and $0.05; finding it out from a month of rejected drafts costs rather
more.

## Report

```ts
const { groups, drift, markdown } = report(records, { compare: ['v3', 'v4'] });
```

Grouped by node and prompt version: how many records, what the judging cost in total and per
record, judge latency at p50/p95/max, your node's own latency, the count of each decision, how
many records carry a judge error, and per question the flagged rate plus a distribution — a
ten-bin histogram for a noul, a count per label for a choice, a count per level for a score.
`report()` returns the structures and the markdown; `reportMarkdown(result, title)` re-renders
them.

## CLI

Four verbs. Each one reads JSON and writes JSON or markdown, and each is a thin wrapper over the
function of the same name.

```bash
jevidence lint-panel panels/*.json
jevidence replay --panel panels/seo-review.json --data runs.jsonl --out records.jsonl --concurrency 4
jevidence calibrate --records records.jsonl --labels labels.json --panel panels/seo-review.json --out calibration.md
jevidence report --records records.jsonl --compare v3,v4 --out report.md
```

`lint-panel` exits 1 on a lint error; `calibrate` exits 1 if any question graded `drop`, so CI can
fail on it. `--fake` uses the deterministic fake client, which lets you wire up the whole pipeline
before you have a key. Otherwise the endpoint comes from `JEVIDENCE_BASE_URL` with
`JEVIDENCE_API_KEY`, or from the TypeSafe SDK's own configuration.

## Clients

One `JevClient` interface, three implementations:

- **`sdkClient({ apiKey })`** wraps `@typesafe-ai/sdk`. The peer is imported lazily, so its
  absence is an error message rather than a missing module at build time.
- **`httpClient({ baseUrl, apiKey })`** posts to anything that speaks `/v1/systemone` — the
  direct API, or your own gateway or proxy. It retries 429, 529 and 5xx twice by default, honours
  `Retry-After`, and maps status codes onto `JevAuthError`, `JevInvalidRequest`, `JevRateLimited`,
  `JevOverloaded` and `JevUnreachable` so a caller can tell a bad key from a busy model. If the
  endpoint reports a `costUSD`, that is what gets recorded; otherwise it is priced locally at
  $0.042 per million input tokens.
- **`fakeClient()`** answers deterministically from a hash of the state and the question, costs
  nothing, and never touches the network. Sentinels in the instructions drive any outcome a test
  needs: `jev:p=0.93`, `jev:score=3`, `jev:choice=none`, `jev:contains=widget`, `jev:error=429`.
  It records every call on `.calls`, so a test can assert on what was actually asked.

Writing a fourth is implementing one method:

```ts
interface JevClient {
  judge(state: JevState, questions: WireQuestions, opts?: JudgeOptions): Promise<JudgeResult>;
}
```

## What it costs

Jev is $0.042 per million input tokens; output tokens are free. Measured through a gateway in
front of the API:

| | |
|---|---|
| 5 noul questions over a ~400-word passage | ~$0.0005, 250–700 ms |
| 49 passages, two panels over each | $0.049 for 98 records and 2,741 judgments |

The second row is the interesting one, because the first attempt at exactly that run cost
**$0.34** — 6.9× more — and the difference was not the model. The 3,100-token brief was being
repeated inside every question's `instructions`, so the bill scaled with brief × questions ×
sentences instead of with the passage: 8.06M input tokens for 98 records. Moving the brief into
the state, where it is sent once per request, and having the questions refer to it by name,
brought the same 98 records down to 1.16M tokens and $0.049. Median judge latency fell with it,
826 ms to 252 ms on one panel, because a request carrying one copy of the brief is a smaller
request.

So: put shared context in the state. The built-in state modes (`input+output`, `output`) already
do this; if you pass your own `buildState`, do the same. This is the one mistake that turns a
cheap judge into an expensive one.

## Limits

These are Jev's, and they shape how a panel should be written:

- **It cannot count or do arithmetic.** "Does this section have at least three citations" is a
  question for your code. "Does this sentence carry a citation marker" is a question for Jev.
- **It reads literally.** No implied intent, no reading between lines. Weak at comparing dates.
  Accuracy drops the deeper the reasoning goes — a property of a property is a bad question.
- **Text only**, and lower accuracy outside English.
- **The state is neutral data.** Text inside it can steer an answer; treat untrusted input as
  untrusted.
- **Answers are independent.** One question's answer is not context for another's. Decompose the
  judgment, ask each part, and combine in your code.
- **64k tokens per request**, and the state plus the single longest question must fit in 32k.
  `measure` and `replay` plan around this: questions × segments are packed into the fewest
  requests that fit, at roughly 3.7 characters per token. A question that cannot fit beside the
  state even on its own raises `BudgetExceeded`, which names the question and both sizes, rather
  than being dropped.

And one of jevidence's own: a `grade` is only as good as the labels behind it. `calibrate()` tells
you how a question compares to the reviewers you gave it, on the passages you gave it. It cannot
tell you the reviewers were right, and it says nothing about text unlike what it was scored on.

## Related work

jevidence is built on other people's work. `huncho` is the closest neighbour — typed questions,
a JSONL journal, replay, a threshold sweep — and it is where the shape of an append-only record
of what was asked and what came back comes from. `jevcal` argues that a judge's thresholds belong
in a checked-in file rather than in someone's head, and that argument is why panels are data here.
`jev-ood-calibration` measured what happens to Jev's probabilities when the input drifts away from
what they were fitted on, and reliability bins are in `calibrate()` because of it. ASSAY-001 is a
pre-registered, hash-sealed calibration check, and it is a good model for saying exactly what an
evaluation does and does not claim. LangChain's write-up on using Jev as an agent evaluator is
what made a cheap decision model as a continuous judge concrete enough to build against. Thanks
to all of them.

## License

MIT
