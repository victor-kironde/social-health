import {
  DEFAULT_CONFIG,
  type Category,
  type Rating,
  type RelationshipChange,
  type RelationshipSnapshot,
  type RelationshipState,
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

/** Editable form state for a person. `rhythm: null` means "follow the category default". */
export interface PersonDraft {
  displayName: string;
  category: Category;
  importance: Rating;
  rhythm: Rhythm | null;
  quality: Rating | null;
  state: RelationshipState;
}

export function draftFromSnapshot(displayName: string, rel: RelationshipSnapshot): PersonDraft {
  return {
    displayName,
    category: rel.category,
    importance: rel.importance,
    rhythm: rel.rhythm === DEFAULT_CONFIG.defaultRhythm[rel.category] ? null : rel.rhythm,
    quality: rel.quality,
    state: rel.state,
  };
}

/** Events for only the fields that changed; empty when nothing did. */
export function editPersonEvents(
  personId: string,
  before: { displayName: string; rel: RelationshipSnapshot },
  draft: PersonDraft,
  now: Timestamp,
  newId: () => string,
): StoredEvent[] {
  const events: StoredEvent[] = [];
  const name = draft.displayName.trim();
  if (name !== before.displayName) {
    events.push({ id: newId(), ts: now, kind: 'person', body: { id: personId, displayName: name } });
  }

  const { rel } = before;
  const changes: RelationshipChange[] = [];
  if (draft.category !== rel.category) changes.push({ field: 'category', value: draft.category });
  if (draft.importance !== rel.importance) changes.push({ field: 'importance', value: draft.importance });
  if (draft.rhythm !== null) {
    if (draft.rhythm !== rel.rhythm) changes.push({ field: 'rhythm', value: draft.rhythm });
  } else if (rel.rhythm !== DEFAULT_CONFIG.defaultRhythm[draft.category]) {
    // Clear any explicit rhythm so it follows the (possibly new) category default.
    changes.push({ field: 'rhythm', value: null });
  }
  if (draft.quality !== rel.quality) changes.push({ field: 'quality', value: draft.quality });
  if (draft.state !== rel.state) changes.push({ field: 'state', value: draft.state });

  for (const change of changes) {
    const id = newId();
    events.push({ id, ts: now, kind: 'relationship', body: { id, personId, ts: now, ...change } });
  }
  return events;
}
