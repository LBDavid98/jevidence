// What the ledger says, per node and prompt version: what the questions answered, what it cost,
// how long it took, and what moved between two versions.
import type { Decision, JevRecord, Judgment, QuestionType } from './types.js';

export interface QuestionSummary {
  questionId: string;
  type: QuestionType;
  n: number;
  flagged: number;
  flaggedRate: number;
  /** Noul: mean probability. Score: mean level. */
  mean?: number;
  /** Noul: how the probabilities fell, in tenths. */
  histogram?: number[];
  /** Choice: how often each label was picked. Score: how often each level. */
  distribution?: { [key: string]: number };
}

export interface LatencySummary {
  mean: number;
  p50: number;
  p95: number;
  max: number;
}

export interface GroupReport {
  node: string;
  promptVersion: string;
  records: number;
  judgments: number;
  costUSD: number;
  costPerRecord: number;
  inputTokens: number;
  latency: LatencySummary;
  nodeLatency: LatencySummary;
  decisions: { [key in Decision]?: number };
  errors: number;
  questions: QuestionSummary[];
}

export interface QuestionDrift {
  questionId: string;
  flaggedRateFrom: number;
  flaggedRateTo: number;
  flaggedRateDelta: number;
  meanFrom?: number;
  meanTo?: number;
  meanDelta?: number;
}

export interface Drift {
  node: string;
  from: string;
  to: string;
  questions: QuestionDrift[];
  costUSDDelta: number;
  latencyDelta: number;
}

export interface ReportResult {
  groups: GroupReport[];
  drift: Drift[];
  markdown: string;
}

export interface ReportOptions {
  /** Two prompt versions to diff, per node. Without it, a node with exactly two versions diffs itself. */
  compare?: [string, string];
  title?: string;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] as number;
}

function latency(values: number[]): LatencySummary {
  if (values.length === 0) return { mean: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    mean: values.reduce((a, b) => a + b, 0) / values.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] as number,
  };
}

function summarise(questionId: string, judgments: Judgment[]): QuestionSummary {
  const first = judgments[0] as Judgment;
  const n = judgments.length;
  const flagged = judgments.filter((j) => j.flagged).length;
  const summary: QuestionSummary = { questionId, type: first.type, n, flagged, flaggedRate: n === 0 ? 0 : flagged / n };
  if (first.type === 'noul') {
    const values = judgments.map((j) => (typeof j.answer === 'number' ? j.answer : 0));
    summary.mean = values.reduce((a, b) => a + b, 0) / n;
    const histogram = new Array(10).fill(0) as number[];
    for (const v of values) histogram[Math.min(9, Math.max(0, Math.floor(v * 10)))]! += 1;
    summary.histogram = histogram;
    return summary;
  }
  const distribution: { [key: string]: number } = {};
  for (const j of judgments) distribution[String(j.answer)] = (distribution[String(j.answer)] ?? 0) + 1;
  summary.distribution = distribution;
  if (first.type === 'score') {
    const values = judgments.map((j) => (typeof j.answer === 'number' ? j.answer : 0));
    summary.mean = values.reduce((a, b) => a + b, 0) / n;
  }
  return summary;
}

function group(node: string, promptVersion: string, records: JevRecord[]): GroupReport {
  const byQuestion = new Map<string, Judgment[]>();
  let judgments = 0;
  for (const record of records) {
    for (const j of record.judgments) {
      judgments += 1;
      const list = byQuestion.get(j.questionId) ?? [];
      list.push(j);
      byQuestion.set(j.questionId, list);
    }
  }
  const decisions: { [key in Decision]?: number } = {};
  for (const record of records) decisions[record.decision] = (decisions[record.decision] ?? 0) + 1;
  const costUSD = records.reduce((sum, r) => sum + r.costUSD, 0);
  return {
    node,
    promptVersion,
    records: records.length,
    judgments,
    costUSD,
    costPerRecord: records.length === 0 ? 0 : costUSD / records.length,
    inputTokens: records.reduce((sum, r) => sum + r.inputTokens, 0),
    latency: latency(records.map((r) => r.latencyMs)),
    nodeLatency: latency(records.map((r) => r.nodeLatencyMs ?? 0)),
    decisions,
    errors: records.filter((r) => r.error !== undefined).length,
    questions: [...byQuestion.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([id, list]) => summarise(id, list)),
  };
}

function driftBetween(from: GroupReport, to: GroupReport): Drift {
  const ids = [...new Set([...from.questions.map((q) => q.questionId), ...to.questions.map((q) => q.questionId)])].sort();
  const questions = ids.map((questionId) => {
    const a = from.questions.find((q) => q.questionId === questionId);
    const b = to.questions.find((q) => q.questionId === questionId);
    const entry: QuestionDrift = {
      questionId,
      flaggedRateFrom: a?.flaggedRate ?? 0,
      flaggedRateTo: b?.flaggedRate ?? 0,
      flaggedRateDelta: (b?.flaggedRate ?? 0) - (a?.flaggedRate ?? 0),
    };
    if (a?.mean !== undefined) entry.meanFrom = a.mean;
    if (b?.mean !== undefined) entry.meanTo = b.mean;
    if (a?.mean !== undefined && b?.mean !== undefined) entry.meanDelta = b.mean - a.mean;
    return entry;
  });
  return {
    node: to.node,
    from: from.promptVersion,
    to: to.promptVersion,
    questions,
    costUSDDelta: to.costPerRecord - from.costPerRecord,
    latencyDelta: to.latency.mean - from.latency.mean,
  };
}

/** Group the ledger by (node, promptVersion) and describe each group. */
export function report(records: JevRecord[], options: ReportOptions = {}): ReportResult {
  const groups = new Map<string, JevRecord[]>();
  for (const record of records) {
    const key = `${record.node}\t${record.promptVersion}`;
    const list = groups.get(key) ?? [];
    list.push(record);
    groups.set(key, list);
  }
  const reports = [...groups.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, list]) => {
      const [node = '', promptVersion = ''] = key.split('\t');
      return group(node, promptVersion, list);
    });

  const drift: Drift[] = [];
  const nodes = [...new Set(reports.map((r) => r.node))];
  for (const node of nodes) {
    const versions = reports.filter((r) => r.node === node);
    if (options.compare) {
      const from = versions.find((v) => v.promptVersion === options.compare?.[0]);
      const to = versions.find((v) => v.promptVersion === options.compare?.[1]);
      if (from && to) drift.push(driftBetween(from, to));
    } else if (versions.length === 2) {
      drift.push(driftBetween(versions[0] as GroupReport, versions[1] as GroupReport));
    }
  }

  const result: ReportResult = { groups: reports, drift, markdown: '' };
  result.markdown = reportMarkdown(result, options.title);
  return result;
}

const usd = (x: number) => `$${x.toFixed(6)}`;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const ms = (x: number) => `${Math.round(x)}ms`;

/** The same thing as markdown. */
export function reportMarkdown(result: ReportResult, title = 'Jevidence report'): string {
  const lines: string[] = [`# ${title}`, ''];
  if (result.groups.length === 0) {
    lines.push('No records.', '');
    return lines.join('\n');
  }
  lines.push('| node | prompt | records | cost | cost/record | judge p50 | judge p95 | flagged |', '|---|---|---|---|---|---|---|---|');
  for (const g of result.groups) {
    const flagged = g.questions.reduce((sum, q) => sum + q.flagged, 0);
    lines.push(`| ${g.node} | ${g.promptVersion} | ${g.records} | ${usd(g.costUSD)} | ${usd(g.costPerRecord)} | ${ms(g.latency.p50)} | ${ms(g.latency.p95)} | ${flagged}/${g.judgments} |`);
  }
  lines.push('');

  for (const g of result.groups) {
    lines.push(`## ${g.node} — ${g.promptVersion}`, '');
    if (g.errors > 0) lines.push(`${g.errors} record(s) carry a judge error.`, '');
    const decisions = Object.entries(g.decisions).map(([k, v]) => `${k} ${v}`).join(', ');
    lines.push(`Decisions: ${decisions || 'none'}. ${g.inputTokens} input tokens, ${ms(g.nodeLatency.mean)} mean in the node itself.`, '');
    lines.push('| question | type | n | flagged | mean | distribution |', '|---|---|---|---|---|---|');
    for (const q of g.questions) {
      const distribution = q.histogram ? q.histogram.join(' ') : Object.entries(q.distribution ?? {}).map(([k, v]) => `${k}:${v}`).join(' ');
      lines.push(`| \`${q.questionId}\` | ${q.type} | ${q.n} | ${pct(q.flaggedRate)} | ${q.mean === undefined ? '-' : q.mean.toFixed(3)} | ${distribution} |`);
    }
    lines.push('');
  }

  for (const d of result.drift) {
    lines.push(`## Drift — ${d.node}: ${d.from} to ${d.to}`, '');
    lines.push(`Cost per record ${d.costUSDDelta >= 0 ? '+' : ''}${usd(d.costUSDDelta)}, judge latency ${d.latencyDelta >= 0 ? '+' : ''}${ms(d.latencyDelta)}.`, '');
    lines.push('| question | flagged before | flagged after | change |', '|---|---|---|---|');
    for (const q of d.questions) {
      lines.push(`| \`${q.questionId}\` | ${pct(q.flaggedRateFrom)} | ${pct(q.flaggedRateTo)} | ${q.flaggedRateDelta >= 0 ? '+' : ''}${(q.flaggedRateDelta * 100).toFixed(0)}pp |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
