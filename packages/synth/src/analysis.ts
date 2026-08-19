import {
  DEFAULT_CONFIG,
  computeScore,
  type ComponentName,
  type EventLog,
  type ModelConfig,
  type Timestamp,
} from '@sg/score-engine';
import * as s from './scenarios';

/**
 * Sensitivity and ablation analysis of the score model. Pure functions over
 * the synthetic scenarios and random networks; the report is produced by
 * scripts/sensitivity.ts.
 */

export const COMPONENTS: ComponentName[] = ['rhythm', 'coverage', 'quality', 'diversity', 'calls', 'frecency'];

export const NAMED_SCENARIOS: Record<string, () => EventLog> = {
  'Close-knit, in person': () => s.closeKnit(),
  'Close-knit, messages only': () => s.closeKnit('message'),
  'Inactive 90 days': s.inactive,
  'Large, important neglected': s.largeNeglected,
  'Balanced (6 people)': s.balanced,
  'Concentrated on one person': s.concentrated,
  'Bereavement, in memoriam': () => s.bereavement(true),
  'Bereavement, still active': () => s.bereavement(false),
  'Busy period, paused': () => s.busyPeriod(true),
  'Busy period, not paused': () => s.busyPeriod(false),
  'Single category': s.singleCategory,
  'Diverse categories': s.diverse,
  'Calls: regular with everyone': s.callsRegular,
  'Calls: connected, none': s.callsNone,
  'Calls: spread across people': s.callsSpread,
  'Calls: all with one person': s.callsConcentrated,
  'Calls only, nothing logged': s.callsOnly,
  'Calls: regular but all brief': s.callsBrief,
  'Rated very good, supportive': () => s.rated(5),
  'Rated strained, unsupportive': () => s.rated(2),
};

/** Expected pairwise orderings (higher, lower), decided before the formulas; see orderings.test.ts. */
export const ORDERINGS: [label: string, higher: string, lower: string][] = [
  ['O1', 'Close-knit, in person', 'Large, important neglected'],
  ['O2', 'Balanced (6 people)', 'Concentrated on one person'],
  ['O3', 'Close-knit, in person', 'Inactive 90 days'],
  ['O4', 'Close-knit, in person', 'Close-knit, messages only'],
  ['O5', 'Bereavement, in memoriam', 'Bereavement, still active'],
  ['O8', 'Busy period, paused', 'Busy period, not paused'],
  ['O11', 'Calls: regular with everyone', 'Calls: connected, none'],
  ['O12', 'Calls: spread across people', 'Calls: all with one person'],
  ['O14', 'Rated very good, supportive', 'Rated strained, unsupportive'],
  ['O15', 'Calls: regular with everyone', 'Calls: regular but all brief'],
];

export type Weights = Record<ComponentName, number>;

export interface ScenarioResult {
  total: number;
  components: Record<ComponentName, number | null>;
}

export function scoreAll(config: ModelConfig, asOf: Timestamp): Record<string, ScenarioResult> {
  const out: Record<string, ScenarioResult> = {};
  for (const [name, build] of Object.entries(NAMED_SCENARIOS)) {
    const r = computeScore(build(), config, asOf);
    out[name] = { total: r.total, components: r.components };
  }
  return out;
}

export function withWeights(weights: Partial<Weights>, base: ModelConfig = DEFAULT_CONFIG): ModelConfig {
  return { ...base, componentWeights: { ...base.componentWeights, ...weights } };
}

export function violatedOrderings(results: Record<string, ScenarioResult>): string[] {
  return ORDERINGS.filter(([, hi, lo]) => !(results[hi]!.total > results[lo]!.total)).map(([label]) => label);
}

/** Average ranks (ties share the mean rank). */
export function ranks(values: number[]): number[] {
  const order = values.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0]);
  const r = new Array<number>(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[order[k]![1]] = avg;
    i = j + 1;
  }
  return r;
}

export function pearson(x: number[], y: number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
    syy += (y[i]! - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

export function spearman(x: number[], y: number[]): number {
  return pearson(ranks(x), ranks(y));
}

/** How a variant model compares with the baseline on the named scenarios. */
export function compare(baseline: Record<string, ScenarioResult>, variant: Record<string, ScenarioResult>) {
  const names = Object.keys(baseline);
  const b = names.map((n) => baseline[n]!.total);
  const v = names.map((n) => variant[n]!.total);
  return {
    spearman: spearman(b, v),
    maxAbsDelta: Math.max(...names.map((_, i) => Math.abs(v[i]! - b[i]!))),
    violated: violatedOrderings(variant),
  };
}

/**
 * Each component's weighted contribution to the total, as used in the score:
 * weights renormalised over the components that are defined for this network.
 */
export function contributions(components: Record<ComponentName, number | null>, weights: Weights): Record<ComponentName, number> {
  let den = 0;
  for (const c of COMPONENTS) if (components[c] !== null) den += weights[c];
  const out = {} as Record<ComponentName, number>;
  for (const c of COMPONENTS) {
    const v = components[c];
    out[c] = v === null || den === 0 ? 0 : (100 * weights[c] * v) / den;
  }
  return out;
}

/**
 * Variance decomposition of the total over a sample of networks: share_c =
 * cov(contribution_c, total) / var(total). Shares sum to 1; a share far
 * above the component's weight would mean it dominates.
 */
export function varianceShares(samples: Record<ComponentName, number>[]): Record<ComponentName, number> {
  const totals = samples.map((s) => COMPONENTS.reduce((a, c) => a + s[c], 0));
  const n = totals.length;
  const mt = totals.reduce((a, b) => a + b, 0) / n;
  const varT = totals.reduce((a, t) => a + (t - mt) ** 2, 0) / n;
  const out = {} as Record<ComponentName, number>;
  for (const c of COMPONENTS) {
    const xs = samples.map((s) => s[c]);
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const cov = xs.reduce((a, x, i) => a + (x - mx) * (totals[i]! - mt), 0) / n;
    out[c] = varT === 0 ? 0 : cov / varT;
  }
  return out;
}
