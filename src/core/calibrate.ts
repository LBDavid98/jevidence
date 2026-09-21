// Does a question answer the way a human would? Join the judgments to the labels, then the
// textbook measures: precision and recall at the panel's threshold, a Brier score, reliability
// bins with their calibration error, and a sweep that says where the threshold should sit.
import { questionThreshold } from './panel.js';
import type { JevRecord, Judgment, Label, Panel, QuestionType } from './types.js';

export interface Pair {
  node: string;
  stateHash: string;
  questionId: string;
  segmentIndex?: number;
  judgment: Judgment;
  label: Label;
}

const SEP = String.fromCharCode(1);
const keyOf = (node: string, stateHash: string, questionId: string, segmentIndex?: number) => [node, stateHash, questionId, segmentIndex ?? ''].join(SEP);

/** Join on (node, stateHash, questionId, segmentIndex). The last record for a key wins. */
export function joinLabels(records: JevRecord[], labels: Label[]): { pairs: Pair[]; unmatchedLabels: Label[]; unjudged: number } {
  const judgments = new Map<string, { record: JevRecord; judgment: Judgment }>();
  for (const record of records) {
    for (const judgment of record.judgments) {
      judgments.set(keyOf(record.node, record.stateHash, judgment.questionId, judgment.segmentIndex), { record, judgment });
    }
  }
  const pairs: Pair[] = [];
  const unmatchedLabels: Label[] = [];
  const used = new Set<string>();
  for (const label of labels) {
    const key = keyOf(label.node, label.stateHash, label.questionId, label.segmentIndex);
    const hit = judgments.get(key);
    if (!hit) {
      unmatchedLabels.push(label);
      continue;
    }
    used.add(key);
    const pair: Pair = { node: label.node, stateHash: label.stateHash, questionId: label.questionId, judgment: hit.judgment, label };
    if (label.segmentIndex !== undefined) pair.segmentIndex = label.segmentIndex;
    pairs.push(pair);
  }
  return { pairs, unmatchedLabels, unjudged: judgments.size - used.size };
}

export interface ReliabilityBin {
  lower: number;
  upper: number;
  n: number;
  meanProbability: number;
  observedRate: number;
}

export interface SweepPoint {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
}

export type Grade = 'trust' | 'tune' | 'drop';

export interface QuestionCalibration {
  questionId: string;
  type: QuestionType;
  n: number;
  positives: number;
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** Noul only: mean squared error of the probability against the truth. */
  brier?: number;
  /** Noul only: expected calibration error over the reliability bins. */
  ece?: number;
  bins: ReliabilityBin[];
  sweep: SweepPoint[];
  /** Choice and score: how often the answer was the labelled one. */
  accuracy?: number;
  /** The threshold that reaches the target precision while keeping the most recall. */
  recommendedThreshold?: number;
  grade: Grade;
  reason: string;
}

export interface CalibrationReport {
  questions: QuestionCalibration[];
  matched: number;
  unmatchedLabels: Label[];
  /** Judgments no label covered. */
  unjudged: number;
  targetPrecision: number;
}

export interface CalibrateOptions {
  /** Supplies each question's threshold. Without it, 0.5. */
  panel?: Panel;
  /** One threshold for every question, whatever the panel says. */
  threshold?: number;
  /** What a question has to reach to be graded `trust`. Default 0.9. */
  targetPrecision?: number;
  /** Recall below this cannot be graded `trust`. Default 0.5. */
  minRecall?: number;
  /** Reliability bins. Default 10. */
  bins?: number;
  /** Fewer labels than this is never `trust`, however good the numbers look. Default 10. */
  minSamples?: number;
  /** Thresholds to try. Default 0.05 to 0.95 in steps of 0.05. */
  sweep?: number[];
}

const truthy = (truth: Label['truth']): boolean => truth === true || truth === 1 || truth === 'true' || truth === 'yes';

function pr(tp: number, fp: number, fn: number): { precision: number; recall: number; f1: number } {
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { precision, recall, f1 };
}

function counts(points: Array<{ p: number; y: boolean }>, threshold: number): { tp: number; fp: number; fn: number; tn: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const { p, y } of points) {
    const predicted = p >= threshold;
    if (predicted && y) tp++;
    else if (predicted && !y) fp++;
    else if (!predicted && y) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn };
}

function reliability(points: Array<{ p: number; y: boolean }>, binCount: number): { bins: ReliabilityBin[]; ece: number } {
  const bins: ReliabilityBin[] = [];
  let ece = 0;
  for (let i = 0; i < binCount; i++) {
    const lower = i / binCount;
    const upper = (i + 1) / binCount;
    const inBin = points.filter(({ p }) => (i === binCount - 1 ? p >= lower && p <= upper : p >= lower && p < upper));
    const n = inBin.length;
    const meanProbability = n === 0 ? (lower + upper) / 2 : inBin.reduce((sum, x) => sum + x.p, 0) / n;
    const observedRate = n === 0 ? 0 : inBin.filter((x) => x.y).length / n;
    bins.push({ lower, upper, n, meanProbability, observedRate });
    if (n > 0) ece += (n / points.length) * Math.abs(observedRate - meanProbability);
  }
  return { bins, ece };
}

const DEFAULT_SWEEP = Array.from({ length: 19 }, (_, i) => Number(((i + 1) * 0.05).toFixed(2)));

/** Grade every question a label touches. */
export function calibrate(records: JevRecord[], labels: Label[], options: CalibrateOptions = {}): CalibrationReport {
  const { panel, targetPrecision = 0.9, minRecall = 0.5, bins: binCount = 10, minSamples = 10, sweep: grid = DEFAULT_SWEEP } = options;
  const { pairs, unmatchedLabels, unjudged } = joinLabels(records, labels);

  const byQuestion = new Map<string, Pair[]>();
  for (const pair of pairs) {
    const list = byQuestion.get(pair.questionId) ?? [];
    list.push(pair);
    byQuestion.set(pair.questionId, list);
  }

  const questions: QuestionCalibration[] = [];
  for (const [questionId, group] of [...byQuestion.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const first = group[0] as Pair;
    const type = first.judgment.type;
    const question = panel?.questions[questionId];
    const threshold = options.threshold ?? (question ? questionThreshold(question) : 0.5);

    if (type === 'noul') {
      const points = group.map((pair) => ({ p: typeof pair.judgment.answer === 'number' ? pair.judgment.answer : 0, y: truthy(pair.label.truth) }));
      const n = points.length;
      const positives = points.filter((x) => x.y).length;
      const at = counts(points, threshold);
      const { precision, recall, f1 } = pr(at.tp, at.fp, at.fn);
      const brier = n === 0 ? 0 : points.reduce((sum, x) => sum + (x.p - (x.y ? 1 : 0)) ** 2, 0) / n;
      const { bins, ece } = reliability(points, binCount);
      const sweep: SweepPoint[] = grid.map((t) => {
        const c = counts(points, t);
        return { threshold: t, ...pr(c.tp, c.fp, c.fn), tp: c.tp, fp: c.fp, fn: c.fn };
      });
      const reachable = sweep.filter((s) => s.precision >= targetPrecision && s.recall > 0).sort((a, b) => b.recall - a.recall || a.threshold - b.threshold);
      const best = reachable[0];

      let grade: Grade;
      let reason: string;
      if (n < minSamples) {
        grade = 'tune';
        reason = `only ${n} label(s); ${minSamples} is the floor for a verdict`;
      } else if (precision >= targetPrecision && recall >= minRecall) {
        grade = 'trust';
        reason = `precision ${precision.toFixed(2)} at threshold ${threshold}, recall ${recall.toFixed(2)}`;
      } else if (best && best.recall >= 0.25) {
        grade = 'tune';
        reason = `threshold ${best.threshold} reaches precision ${best.precision.toFixed(2)} at recall ${best.recall.toFixed(2)}`;
      } else {
        grade = 'drop';
        reason = `no threshold reaches precision ${targetPrecision} with usable recall (best precision ${Math.max(0, ...sweep.map((s) => s.precision)).toFixed(2)})`;
      }

      const entry: QuestionCalibration = { questionId, type, n, positives, threshold, precision, recall, f1, ...at, brier, ece, bins, sweep, grade, reason };
      if (best) entry.recommendedThreshold = best.threshold;
      questions.push(entry);
      continue;
    }

    // Choice and score: the answer either is the labelled one or it is not.
    const hits = group.filter((pair) => String(pair.judgment.answer) === String(pair.label.truth)).length;
    const n = group.length;
    const accuracy = n === 0 ? 0 : hits / n;
    const grade: Grade = n < minSamples ? 'tune' : accuracy >= targetPrecision ? 'trust' : accuracy >= 0.5 ? 'tune' : 'drop';
    const reason = n < minSamples ? `only ${n} label(s); ${minSamples} is the floor for a verdict` : `${hits} of ${n} answers matched the label`;
    questions.push({ questionId, type, n, positives: hits, threshold, precision: accuracy, recall: accuracy, f1: accuracy, tp: hits, fp: n - hits, fn: n - hits, tn: 0, bins: [], sweep: [], accuracy, grade, reason });
  }

  return { questions, matched: pairs.length, unmatchedLabels, unjudged, targetPrecision };
}

const num = (x: number) => (Number.isFinite(x) ? x.toFixed(2) : '-');

/** The report as markdown, one row per question. */
export function calibrationMarkdown(report: CalibrationReport, title = 'Calibration'): string {
  const lines: string[] = [`# ${title}`, ''];
  lines.push(`${report.matched} judgment(s) matched a label. ${report.unmatchedLabels.length} label(s) matched nothing; ${report.unjudged} judgment(s) carry no label.`, '');
  lines.push('| question | n | threshold | precision | recall | brier | ECE | recommended | grade |');
  lines.push('|---|---|---|---|---|---|---|---|---|');
  for (const q of report.questions) {
    lines.push(
      `| \`${q.questionId}\` | ${q.n} | ${q.threshold} | ${num(q.precision)} | ${num(q.recall)} | ${q.brier === undefined ? '-' : num(q.brier)} | ${q.ece === undefined ? '-' : num(q.ece)} | ${q.recommendedThreshold ?? '-'} | **${q.grade}** |`,
    );
  }
  lines.push('');
  for (const q of report.questions) lines.push(`- \`${q.questionId}\`: ${q.reason}`);
  lines.push('');
  return lines.join('\n');
}
