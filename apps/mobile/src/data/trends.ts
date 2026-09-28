import { DAY, DEFAULT_CONFIG, computeScore, type EventLog, type ModelConfig, type Timestamp } from '@sg/score-engine';
import { relationshipHealth, type HealthBand } from './health';

/** How far back the trends look, and how finely. */
export type TrendRange = '1m' | '3m' | '5m' | '1y';

export const TREND_RANGES: Record<TrendRange, { label: string; points: number; stepDays: number }> = {
  '1m': { label: 'Month', points: 30, stepDays: 1 },
  '3m': { label: '3 months', points: 13, stepDays: 7 },
  '5m': { label: '5 months', points: 22, stepDays: 7 },
  '1y': { label: 'Year', points: 12, stepDays: 30 },
};

const RETIRED = new Set(['archived', 'in_memoriam']);
export const BAND_ORDER: HealthBand[] = [5, 4, 3, 2, 1, 'lost'];

export interface TrendPoint {
  /** End of this period. */
  ts: Timestamp;
  /** Score (0–100) as of `ts`, or null before you had added anyone. */
  total: number | null;
  /** How many relationships were in each closeness band at `ts`. */
  bands: Record<HealthBand, number>;
  /** Catch-ups logged during the period ending at `ts` (a group catch-up counts once). */
  catchUps: number;
  /** Answered calls during the period (when call history is connected). */
  calls: number;
}

/**
 * The score, the closeness mix and the catch-ups over time, by re-running the engine as of each
 * point. Every point only sees what had happened by then, so later entries never rewrite history
 * (except catch-ups logged late, which count on the day they happened).
 */
export function trendPoints(log: EventLog, now: Timestamp, range: TrendRange, config: ModelConfig = DEFAULT_CONFIG): TrendPoint[] {
  const { points, stepDays } = TREND_RANGES[range];
  const step = stepDays * DAY;
  const firstAdded = Math.min(...log.relationshipEvents.map((e) => e.ts));
  const out: TrendPoint[] = [];
  for (let k = points - 1; k >= 0; k--) {
    const ts = now - k * step;
    const from = ts - step;
    const bands = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<HealthBand, number>;
    let total: number | null = null;
    if (ts >= firstAdded) {
      const result = computeScore(log, config, ts);
      total = result.total;
      for (const r of result.relationships) if (!RETIRED.has(r.state)) bands[relationshipHealth(r)]++;
    }
    out.push({
      ts,
      total,
      bands,
      catchUps: log.interactions.filter((x) => x.ts > from && x.ts <= ts).length,
      calls: (log.calls ?? []).filter((c) => c.ts > from && c.ts <= ts && c.direction !== 'missed').length,
    });
  }
  return out;
}

/** Change in the 1–10 score from the first scored point to the last, for a one-line summary. */
export function trendChange(points: TrendPoint[], toTen: (total: number) => number): number | null {
  const scored = points.filter((p) => p.total !== null);
  if (scored.length < 2) return null;
  return toTen(scored[scored.length - 1]!.total!) - toTen(scored[0]!.total!);
}
