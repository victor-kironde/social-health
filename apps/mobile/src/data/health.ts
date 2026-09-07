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
