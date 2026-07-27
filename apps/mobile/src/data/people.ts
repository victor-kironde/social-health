import {
  DEFAULT_CONFIG,
  type Category,
  type Rating,
  type RelationshipChange,
  type Rhythm,
  type Timestamp,
} from '@sg/score-engine';
import type { StoredEvent } from './codec';

export interface NewPersonInput {
  displayName: string;
  category: Category;
  importance: Rating;
  /** Omit (or pass the category default) to follow the category default, so later default changes still apply. */
  rhythm?: Rhythm;
  quality: Rating | null;
}

export const MAX_NAME_LENGTH = 60;

export function validatePerson(input: NewPersonInput): string | null {
  const name = input.displayName.trim();
  if (!name) return 'Enter a name.';
  if (name.length > MAX_NAME_LENGTH) return `Keep the name under ${MAX_NAME_LENGTH} characters.`;
  return null;
}

/** The events that record a new person and the owner's private view of the relationship. */
export function newPersonEvents(input: NewPersonInput, now: Timestamp, newId: () => string): StoredEvent[] {
  const personId = newId();
  const changes: RelationshipChange[] = [
    { field: 'category', value: input.category },
    { field: 'importance', value: input.importance },
  ];
  if (input.rhythm && input.rhythm !== DEFAULT_CONFIG.defaultRhythm[input.category]) {
    changes.push({ field: 'rhythm', value: input.rhythm });
  }
  if (input.quality !== null) changes.push({ field: 'quality', value: input.quality });

  return [
    { id: newId(), ts: now, kind: 'person', body: { id: personId, displayName: input.displayName.trim() } },
    ...changes.map((change): StoredEvent => {
      const id = newId();
      return { id, ts: now, kind: 'relationship', body: { id, personId, ts: now, ...change } };
    }),
  ];
}
