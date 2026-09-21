# jevidence

Measure what your agents and prompts actually do.

Wrap any async function in `measure()`, hand it a panel of typed questions, and every call comes
back with the same answer it always did — plus a record of how good that answer was. The
questions are answered by [Jev](https://typesafe.ai), TypeSafe AI's judge model, which returns a
probability rather than an opinion, so "is this claim uncited?" is a number you can threshold,
calibrate against human labels, and watch move when you change the prompt.

The pieces you get: a `measure(node, panel)` wrapper for any async function, panels as shareable
versioned JSON, replay over output you already have, calibration against ground truth, and a
report per node and prompt version with distributions, cost, latency and drift.

## Install

```bash
npm install jevidence
```

Node 22 or newer, ESM. The only runtime dependency is `zod`. If you want to talk to TypeSafe
directly, add the SDK as well — it is an optional peer, and everything except `sdkClient()` works
without it.

```bash
npm install @typesafe-ai/sdk
```

## Measure something

```ts
import { measure, loadPanel, sdkClient, jsonlLedger } from 'jevidence';

const panel = await loadPanel('panels/generic-quality.json');

const writeSection = async (brief: string) => callYourModel(brief);

const measured = measure(writeSection, panel, {
  client: sdkClient({ apiKey: process.env.TYPESAFE_API_KEY }),
  ledger: jsonlLedger('.jevidence/records.jsonl'),
  identity: { node: 'write-section', promptVersion: 'v3' },
});

const section = await measured('invoicing costs for small firms');
```

`measured` has the same signature as `writeSection` and returns the same thing. Behind it, one
record per call lands in the ledger: the judgments, the spans they are about, the model, the
tokens, the cost, the latency, and the decision. With no `policy`, that is all it does — it
observes. Add a policy and the same wrapper can flag, escalate, retry or block.

## Panels

A panel is a JSON file: an id, a version, how to cut the output up, and the questions.

```json
{
  "id": "seo-review",
  "version": "1",
  "segment": "sentence",
  "state": "input+output",
  "questions": {
    "claim-outside-brief": {
      "type": "noul",
      "severity": "hard",
      "threshold": 0.7,
      "instructions": "This sentence makes a factual claim that nothing in the research brief supports."
    }
  }
}
```

Three question types, straight from Jev: `noul` (yes/no, answered as a probability), `choice`
(pick one label) and `score` (a level on a rubric of two to ten). Jevidence adds `threshold` and
`severity`, and `per: "unit"` for a question that is about the whole text rather than each
sentence.

Your code picks the spans, never the model. A sentence-segmented panel asks every question about
every sentence in one request, batched under Jev's 64k token budget, and each judgment comes back
carrying the span it is about — so a finding quotes the text verbatim by construction and nothing
is ever dropped for failing to quote itself correctly.

`lintPanel()` catches the habits that make a typed question answer badly: a noul with two
conditions joined by "and", a score with eleven levels, a choice with no way to say "none of
these", instructions so short they only make sense next to the id.

Three panels ship with the package: `seo-review`, `brief-check` and `generic-quality`. Copy one
and edit it.

## Replay

Comparing prompt v1 with prompt v2 should not cost what running the expensive model twice costs.
Replay runs a panel over output you already have.

```ts
import { replay, loadPanel, httpClient, jsonlLedger } from 'jevidence';

const panel = await loadPanel('panels/seo-review.json');
const client = httpClient({ baseUrl: 'https://your-gateway.example' });

const result = await replay(panel, 'runs.jsonl', client, {
  ledger: jsonlLedger('.jevidence/replay.jsonl'),
});
```

## Calibrate

A question is only worth having if it agrees with a person. Join the records to your labels and
find out.

```ts
import { calibrate, calibrationMarkdown } from 'jevidence';

const report = calibrate(records, labels, { panel, targetPrecision: 0.9 });
console.log(calibrationMarkdown(report));
```

Per question you get precision and recall at the panel's threshold, a Brier score, reliability
bins with their calibration error, a threshold sweep, and a grade: **trust**, **tune** or
**drop**. A question graded `tune` comes with the threshold that would have reached your target
precision.

## Report

```ts
import { report } from 'jevidence';

const { groups, drift, markdown } = report(records, { compare: ['v2', 'v3'] });
```

Grouped by node and prompt version: how the answers were distributed, what the judging cost, how
long it took, and what moved between two versions of the prompt.

## CLI

```bash
jevidence lint-panel panels/*.json
jevidence replay --panel panels/seo-review.json --data runs.jsonl --out records.jsonl
jevidence calibrate --records records.jsonl --labels labels.json --out calibration.md
jevidence report --records records.jsonl --compare v2,v3 --out report.md
```

`--fake` uses the deterministic fake client, so you can wire up a pipeline before you have a key.
Otherwise the endpoint comes from `JEVIDENCE_BASE_URL` with `JEVIDENCE_API_KEY`, or from the
TypeSafe SDK's own configuration.

## Clients

Three of them, behind one `JevClient` interface:

- `sdkClient()` wraps `@typesafe-ai/sdk` for anyone with their own key.
- `httpClient({ baseUrl })` talks to anything that speaks `/v1/systemone`, which is how you put a
  gateway or a proxy in front of it. If the endpoint reports a `costUSD`, that is the one that
  gets recorded; otherwise it is priced locally at $0.042 per million input tokens.
- `fakeClient()` answers deterministically from a hash, costs nothing, and takes sentinels in the
  instructions (`jev:p=0.93`, `jev:contains=widget`, `jev:error=429`) so a test can drive any
  outcome it likes.

Write your own if you need one. `Ledger` is an interface too: `memoryLedger()` and
`jsonlLedger(path)` ship, and a database-backed one is about fifteen lines.

## Testing

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
```

## Related work

Jevidence exists because of a handful of projects that got there first in one way or another.
`huncho` showed what it looks like to keep an honest journal of what a model was asked and what
it said; `jevcal` made the case that a judge's thresholds belong in a file you can check in
rather than in someone's head; `jev-ood-calibration` is a careful study of what happens to a
judge's probabilities when the input drifts away from what it was measured on, and it is the
reason reliability bins are in here at all; ASSAY-001 gave us a vocabulary for saying what an evaluation actually claims; and
the LangChain write-up on using Jev as an agent evaluator is what made the whole idea concrete
enough to build. Thank you to all of them.

## License

MIT
