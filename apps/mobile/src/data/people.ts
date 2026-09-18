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
  /** Other relationship types (e.g. also a colleague). */
  alsoCategories?: Category[];
  importance: Rating;
  /** Omit (or pass the category default) to follow the category default, so later default changes still apply. */
  rhythm?: Rhythm;
  quality: Rating | null;
  /** How close they would like it to be, 1–10, or null for "don't mind". Omit to leave it not set (counted as 10). */
  ideal?: number | null;
}

export const MAX_NAME_LENGTH = 60;
export const DEFAULT_IDEAL = 10;

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
  if (input.ideal !== undefined) changes.push({ field: 'ideal', value: input.ideal });
  const also = (input.alsoCategories ?? []).filter((c) => c !== input.category);
  if (also.length) changes.push({ field: 'alsoCategories', value: [...new Set(also)].sort() });

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
  alsoCategories: Category[];
  importance: Rating;
  rhythm: Rhythm | null;
  quality: Rating | null;
  state: RelationshipState;
  /** Hoped-for closeness 1–10, null = "don't mind", undefined = not set yet (counted as 10). */
  ideal: number | null | undefined;
}

export function draftFromSnapshot(displayName: string, rel: RelationshipSnapshot): PersonDraft {
  return {
    displayName,
    category: rel.category,
    alsoCategories: rel.alsoCategories,
    importance: rel.importance,
    rhythm: rel.rhythm === DEFAULT_CONFIG.defaultRhythm[rel.category] ? null : rel.rhythm,
    quality: rel.quality,
    state: rel.state,
    ideal: rel.idealSet ? rel.ideal : undefined,
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
  // Choosing any ideal (even 10) marks it as set; leaving it alone records nothing.
  if (draft.ideal !== undefined && (!rel.idealSet || draft.ideal !== rel.ideal)) {
    changes.push({ field: 'ideal', value: draft.ideal });
  }
  const also = [...new Set(draft.alsoCategories.filter((c) => c !== draft.category))].sort();
  if (also.join() !== [...rel.alsoCategories].sort().join()) changes.push({ field: 'alsoCategories', value: also });

  for (const change of changes) {
    const id = newId();
    events.push({ id, ts: now, kind: 'relationship', body: { id, personId, ts: now, ...change } });
  }
  return events;
}
