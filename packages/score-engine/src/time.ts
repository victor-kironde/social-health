import type { Pause, Timestamp } from './types';

export const DAY = 86_400_000;

interface Interval {
  from: Timestamp;
  to: Timestamp;
}

/** Clip pauses to asOf, close open pauses at asOf, and merge overlaps. */
export function mergePauses(pauses: Pause[], asOf: Timestamp): Interval[] {
  const clipped = pauses
    .map((p) => ({ from: p.from, to: Math.min(p.to ?? asOf, asOf) }))
    .filter((p) => p.from < p.to)
    .sort((a, b) => a.from - b.from);

  const merged: Interval[] = [];
  for (const p of clipped) {
    const last = merged[merged.length - 1];
    if (last && p.from <= last.to) last.to = Math.max(last.to, p.to);
    else merged.push({ ...p });
  }
  return merged;
}

/** Total paused time inside [from, to]. */
export function pausedOverlap(merged: Interval[], from: Timestamp, to: Timestamp): number {
  let total = 0;
  for (const p of merged) {
    const start = Math.max(p.from, from);
    const end = Math.min(p.to, to);
    if (end > start) total += end - start;
  }
  return total;
}

/** Elapsed time between ts and asOf, excluding paused time. Never negative. */
export function effectiveAgeMs(ts: Timestamp, asOf: Timestamp, merged: Interval[]): number {
  return Math.max(0, asOf - ts - pausedOverlap(merged, ts, asOf));
}
