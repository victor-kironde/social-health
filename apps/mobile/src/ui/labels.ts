import type { Category, Frequency, FrequencyPeriod, InteractionType, Rating, RelationshipState, Rhythm, Timestamp } from '@sg/score-engine';

export const STATE_LABELS: Record<RelationshipState, string> = {
  active: 'Active',
  paused: 'Paused',
  long_distance: 'Long-distance',
  archived: 'Archived',
  in_memoriam: 'In memoriam',
};

export function formatDate(ts: Timestamp): string {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const INTERACTION_LABELS: Record<InteractionType, string> = {
  in_person: 'In person',
  video: 'Video call',
  voice: 'Voice call',
  message: 'Messages',
};

export const WHEN_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Today' },
  { value: 1, label: 'Yesterday' },
  { value: 2, label: '2 days ago' },
  { value: 3, label: '3 days ago' },
  { value: 7, label: 'A week ago' },
  { value: 14, label: '2 weeks ago' },
  { value: 30, label: 'A month ago' },
];

export const CATEGORY_LABELS: Record<Category, string> = {
  family: 'Family',
  friend: 'Friend',
  work: 'Work',
  neighbour: 'Neighbour',
  community: 'Community',
  other: 'Other',
};

export const RHYTHM_LABELS: Record<Rhythm, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Every few months',
  yearly: 'Yearly',
  occasional: 'No set rhythm',
};

/** Guides for ranges of the 1–10 importance scale (band 1 = 1–2 … band 5 = 9–10), not meanings of each step. */
export const IMPORTANCE_LABELS: Record<Rating, string> = {
  1: 'Peripheral',
  2: 'Casual',
  3: 'Moderate',
  4: 'Close',
  5: 'Very close',
};

/** Which guide range an importance of 1–10 falls in (1–2 → 1 … 9–10 → 5). */
export function importanceBand(importance: number): Rating {
  return Math.min(5, Math.max(1, Math.ceil(importance / 2))) as Rating;
}

/** "7 · Close": the number with the guide for its range. */
export function importanceLabel(importance: number): string {
  return `${importance} · ${IMPORTANCE_LABELS[importanceBand(importance)]}`;
}

/** "Close (7–8)": a range guide with its numbers. */
export function importanceRangeText(band: Rating): string {
  return `${IMPORTANCE_LABELS[band]} (${2 * band - 1}–${2 * band})`;
}

export const QUALITY_LABELS: Record<Rating, string> = {
  1: 'Harmful',
  2: 'Strained',
  3: 'Mixed',
  4: 'Good',
  5: 'Very good',
};

export function lastContactText(days: number | null): string {
  if (days === null) return 'No catch-ups yet';
  if (days < 1) return 'Caught up today';
  const d = Math.floor(days);
  return d === 1 ? 'Last catch-up yesterday' : `Last catch-up ${d} days ago`;
}

/** "today", "yesterday", "5 days ago". */
export function daysAgoText(days: number): string {
  const d = Math.floor(days);
  if (d <= 0) return 'today';
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

/** "Family + Work": primary type first. */
export function typesLabel(category: Category, also: Category[] = []): string {
  return [category, ...also.filter((c) => c !== category)].map((c) => CATEGORY_LABELS[c]).join(' + ');
}

const TIMES = ['', 'once', 'twice'];
const PER: Record<FrequencyPeriod, string> = { day: 'a day', week: 'a week', month: 'a month', year: 'a year' };

/** "At least twice a month", "At least 5 times a week". */
export function frequencyText(f: Frequency): string {
  return `At least ${TIMES[f.times] ?? `${f.times} times`} ${PER[f.per]}`;
}

/** Presets in words, as minimums ("At least once a month"). */
export const PRESET_TEXT: Record<Rhythm, string> = {
  weekly: 'At least once a week',
  fortnightly: 'At least once a fortnight',
  monthly: 'At least once a month',
  quarterly: 'At least once every three months',
  yearly: 'At least once a year',
  occasional: 'No set rhythm',
};

/** How often someone hopes to catch up, in words: their custom frequency, or the preset as a minimum. */
export function rhythmLabel(rel: { rhythm: Rhythm; frequency: Frequency | null }): string {
  return rel.frequency ? frequencyText(rel.frequency) : PRESET_TEXT[rel.rhythm];
}
