import type { Category, Rating, Rhythm } from '@sg/score-engine';

export const CATEGORY_LABELS: Record<Category, string> = {
  family: 'Family',
  friend: 'Friend',
  work: 'Work',
  neighbour: 'Neighbour',
  community: 'Community',
};

export const RHYTHM_LABELS: Record<Rhythm, string> = {
  weekly: 'Weekly',
  fortnightly: 'Fortnightly',
  monthly: 'Monthly',
  quarterly: 'Every few months',
  yearly: 'Yearly',
  occasional: 'No set rhythm',
};

export const IMPORTANCE_LABELS: Record<Rating, string> = {
  1: 'Peripheral',
  2: 'Casual',
  3: 'Moderate',
  4: 'Close',
  5: 'Very close',
};

export const QUALITY_LABELS: Record<Rating, string> = {
  1: 'Harmful',
  2: 'Strained',
  3: 'Mixed',
  4: 'Good',
  5: 'Very good',
};

export function lastContactText(days: number | null): string {
  if (days === null) return 'No contact logged';
  if (days < 1) return 'Seen today';
  const d = Math.floor(days);
  return d === 1 ? 'Last contact yesterday' : `Last contact ${d} days ago`;
}
