import type { Rating, RelationshipContribution } from '@sg/score-engine';

/**
 * How a single relationship is doing, for colouring the graph: 5 = good (green) down to
 * 1 = unhealthy (red), or 'lost' (grey) when you have lost touch or are not in the
 * relationship right now.
 */
export type HealthBand = Rating | 'lost';

/** Lost touch: no contact for this many expected intervals (e.g. 3 months for a monthly rhythm). */
export const LOST_FACTOR = 3;

/**
 * A relationship is as healthy as its weakest side: how you said it is going (quality, if
 * rated) and whether you are keeping in touch (rhythm). A harmful relationship is red
 * however often you meet; a very good one you have drifted from turns amber.
 */
export function relationshipHealth(r: RelationshipContribution): HealthBand {
  if (r.state === 'paused' || r.state === 'archived' || r.state === 'in_memoriam') return 'lost';
  if (r.lastContactAgeDays === null) return 'lost';
  if (r.expectedIntervalDays !== null && r.lastContactAgeDays > LOST_FACTOR * r.expectedIntervalDays) return 'lost';
  const rhythm = r.onRhythm ?? 1;
  const rhythmBand: Rating = rhythm >= 0.75 ? 5 : rhythm >= 0.5 ? 4 : rhythm >= 0.25 ? 3 : 2;
  return Math.min(r.quality ?? 5, rhythmBand) as Rating;
}

export const HEALTH_LABELS: Record<HealthBand, string> = {
  5: 'Good',
  4: 'Fairly good',
  3: 'Needs attention',
  2: 'Strained',
  1: 'Unhealthy',
  lost: 'Lost touch',
};

/** The 0–100 score shown as 1–10, for easier reading. */
export function scoreOutOf10(total: number): number {
  return Math.min(10, Math.max(1, 1 + Math.round((Math.max(0, Math.min(100, total)) * 9) / 100)));
}

/** Colour band for a 1–10 score: 1–2 red … 9–10 green. */
export function scoreBand(score10: number): Rating {
  return Math.min(5, Math.max(1, Math.ceil(score10 / 2))) as Rating;
}
