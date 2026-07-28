import type { Category, InteractionType, Rating, RelationshipState, Rhythm, Timestamp } from '@sg/score-engine';

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
