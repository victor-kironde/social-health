import type { Rating, RelationshipContribution } from '@sg/score-engine';

/**
 * How a single relationship is doing, for colouring the graph, in terms of closeness: 5 = close
 * (green) down to 1 = strained (red), or 'lost' (grey) when you have lost touch or are not in the
 * relationship right now.
 */
export type HealthBand = Rating | 'lost';

/** Lost touch: no contact for this many expected intervals (e.g. 3 months for a monthly rhythm)… */
export const LOST_FACTOR = 3;
/** …and never sooner than this, so frequent rhythms (5 times a week) do not "lose touch" in days. */
export const LOST_MIN_DAYS = 30;

/**
 * A relationship is as healthy as its weakest side: how you said it is going (quality, if
 * rated) and whether you are keeping in touch (rhythm). A harmful relationship is red
 * however often you meet; a very good one you have drifted from turns amber.
 */
export function relationshipHealth(r: RelationshipContribution): HealthBand {
  if (r.state === 'paused' || r.state === 'archived' || r.state === 'in_memoriam') return 'lost';
  if (r.lastContactAgeDays === null) return 'lost';
  // Time apart counts more slowly for people you live or work with (decayRate < 1).
  const apart = r.lastContactAgeDays * r.decayRate;
  if (r.expectedIntervalDays !== null && apart > Math.max(LOST_MIN_DAYS, LOST_FACTOR * r.expectedIntervalDays)) {
    return 'lost';
  }
  const rhythm = r.onRhythm ?? 1;
  const rhythmBand: Rating = rhythm >= 0.75 ? 5 : rhythm >= 0.5 ? 4 : rhythm >= 0.25 ? 3 : 2;
  return Math.min(r.quality ?? 5, rhythmBand) as Rating;
}

/** Gentle, closeness-based names for each band (never a verdict on the person). */
export const HEALTH_LABELS: Record<HealthBand, string> = {
  5: 'Close',
  4: 'Connected',
  3: 'Drifting',
  2: 'Distant',
  1: 'Strained',
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

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Blend two `#rrggbb` colours: t = 0 gives a, t = 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = parseHex(a);
  const [br, bg, bb] = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  const ch = (x: number, y: number) => Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${ch(ar, br)}${ch(ag, bg)}${ch(ab, bb)}`;
}

/** How far a group's colour is pulled towards grey, so group areas stay muted behind people. */
export const GROUP_MUTE = 0.3;

/**
 * One colour for a group of relationships (e.g. everyone in "Family"): the average health of
 * those still in touch, on the same red-to-green scale, pulled towards grey by the share you
 * have lost touch with, then muted. All lost touch gives plain grey.
 */
export function groupHealthColour(bands: HealthBand[], palette: Record<HealthBand, string>): string {
  const grey = palette.lost;
  if (bands.length === 0) return grey;
  const active = bands.filter((b): b is Rating => b !== 'lost');
  if (active.length === 0) return grey;
  const mean = active.reduce((s, b) => s + b, 0) / active.length;
  const lo = Math.floor(mean) as Rating;
  const hi = Math.min(5, lo + 1) as Rating;
  const health = mixHex(palette[lo], palette[hi], mean - lo);
  const lostShare = (bands.length - active.length) / bands.length;
  return mixHex(mixHex(health, grey, lostShare), grey, GROUP_MUTE);
}

/** Where a relationship stands against the user's ideal for it. */
export type IdealComparison = 'none' | 'at' | 'below' | 'beyond';

/**
 * Compares a relationship's own 1–10 score with the ideal: within one point counts as "at" it
 * (scores move in steps, so exact equality would be too strict), lower is "below", higher is
 * "beyond" (closer than hoped), and no ideal is "none" ("don't mind").
 */
export function compareToIdeal(score: number, ideal: number | null): IdealComparison {
  if (ideal === null) return 'none';
  if (Math.abs(score - ideal) <= 1) return 'at';
  return score < ideal ? 'below' : 'beyond';
}

export const IDEAL_COMPARISON_LABELS: Record<IdealComparison, string> = {
  none: "Don't mind",
  at: 'At your ideal',
  below: 'Less close than you hope',
  beyond: 'Closer than you hope',
};

/** Name of the closeness band a 1–10 value falls in (e.g. an ideal of 3 → "Distant"). */
export function bandLabelOf(value: number): string {
  return HEALTH_LABELS[scoreBand(value)];
}

/** A relationship's own score from 1 to 10, with the health band it sits in. */
export interface PersonalHealth {
  score: number;
  band: HealthBand;
}

/**
 * A single relationship's score out of 10, from the parts of the main score that belong to one
 * person (weights as in the model): keeping to rhythm 0.25, calls 0.25 (when connected), your
 * quality rating 0.10 (when rated) and recent catch-ups 0.10. Coverage and variety across types
 * describe the whole network, so they are left out. The result is kept within its health band
 * (Close 9–10, Connected 7–8, Drifting 5–6, Distant 3–4, Strained or Lost touch 1–2),
 * so the number, the label and the colour always agree.
 */
export function personalHealth(r: RelationshipContribution): PersonalHealth {
  const band = relationshipHealth(r);
  const parts: [number | null, number][] = [
    [r.onRhythm, 0.25],
    [r.callLevel, 0.25],
    [r.quality === null ? null : (r.quality - 1) / 4, 0.1],
    [r.level, 0.1],
  ];
  let sum = 0;
  let weight = 0;
  for (const [v, w] of parts) {
    if (v === null) continue;
    sum += w * v;
    weight += w;
  }
  const raw = scoreOutOf10(weight > 0 ? (100 * sum) / weight : 0);
  const top = band === 'lost' ? 2 : 2 * band;
  return { score: Math.min(top, Math.max(top - 1, raw)), band };
}
