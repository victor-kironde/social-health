import type { ComponentName, Explanation, ScoreResult } from './types';

const LABELS: Record<ComponentName, string> = {
  rhythm: 'Contact rhythm',
  coverage: 'Coverage of important relationships',
  quality: 'Quality and support',
  diversity: 'Balance across categories',
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Descriptive (never prescriptive) explanations of what changed between two
 * results. Component changes smaller than `threshold` (0-1 scale) are omitted
 * so small fluctuations do not produce noise.
 */
export function explain(
  prev: ScoreResult,
  curr: ScoreResult,
  opts: { threshold?: number; importantThreshold?: number } = {},
): Explanation[] {
  const threshold = opts.threshold ?? 0.05;
  const important = opts.importantThreshold ?? 4;
  const out: Explanation[] = [];

  for (const name of Object.keys(LABELS) as ComponentName[]) {
    const p = prev.components[name];
    const c = curr.components[name];
    if (p === null || c === null || Math.abs(c - p) < threshold) continue;
    const delta = (c - p) * 100;
    out.push({
      kind: 'component_change',
      component: name,
      delta,
      text: `${LABELS[name]} ${delta > 0 ? 'rose' : 'fell'} by ${Math.round(Math.abs(delta))} points.`,
    });
  }

  const prevById = new Map(prev.relationships.map((r) => [r.personId, r]));
  const fell: string[] = [];
  const back: string[] = [];
  const reweighted: string[] = [];
  for (const r of curr.relationships) {
    const before = prevById.get(r.personId);
    if (!before) continue;
    if (before.importance !== r.importance) reweighted.push(r.personId);
    if (!r.included || r.importance < important || r.onRhythm === null || before.onRhythm === null) continue;
    if (before.onRhythm >= 0.5 && r.onRhythm < 0.5) fell.push(r.personId);
    if (before.onRhythm < 0.5 && r.onRhythm >= 0.5) back.push(r.personId);
  }

  if (fell.length) {
    const n = fell.length;
    out.push({
      kind: 'fell_behind',
      personIds: fell,
      text: `${n} important ${plural(n, 'relationship is', 'relationships are')} now behind ${plural(n, 'its', 'their')} usual rhythm.`,
    });
  }
  if (back.length) {
    const n = back.length;
    out.push({
      kind: 'back_on_rhythm',
      personIds: back,
      text: `${n} important ${plural(n, 'relationship is', 'relationships are')} back on ${plural(n, 'its', 'their')} usual rhythm.`,
    });
  }
  if (reweighted.length) {
    const n = reweighted.length;
    out.push({
      kind: 'importance_changed',
      personIds: reweighted,
      text: `Importance changed for ${n} ${plural(n, 'relationship', 'relationships')}, which also changes coverage and the overall score.`,
    });
  }
  if (curr.lowData) {
    out.push({
      kind: 'low_data',
      text: 'Few entries were logged recently, so this score is less certain than usual.',
    });
  }
  return out;
}
