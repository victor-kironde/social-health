import {
  type Category,
  type Frequency,
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
  /** 1–10; omit to leave it at the default of 1. */
  importance?: number;
  /** Omit (or pass the category default) to follow the category default, so later default changes still apply. */
  rhythm?: Rhythm;
  quality: Rating | null;
  /** How close they would like it to be, 1–10, or null for "don't mind". Omit to leave it not set (counted as 10). */
  ideal?: number | null;
  /** A custom "at least N times a period" catch-up frequency, instead of a preset rhythm. */
  frequency?: Frequency | null;
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
  ];
  if (input.importance !== undefined && input.importance !== 1) {
    changes.push({ field: 'importance', value: input.importance, scale: 10 });
  }
  // A rhythm chosen here is kept even if it matches today's default; omit it to follow the default.
  if (input.rhythm && !input.frequency) changes.push({ field: 'rhythm', value: input.rhythm });
  if (input.quality !== null) changes.push({ field: 'quality', value: input.quality });
  if (input.ideal !== undefined) changes.push({ field: 'ideal', value: input.ideal });
  if (input.frequency) changes.push({ field: 'frequency', value: input.frequency });
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
  /** 1–10 (default 1). */
  importance: number;
  rhythm: Rhythm | null;
  quality: Rating | null;
  state: RelationshipState;
  /** Hoped-for closeness 1–10, null = "don't mind", undefined = not set yet (counted as 10). */
  ideal: number | null | undefined;
  /** Custom minimum frequency; when set it replaces `rhythm`. */
  frequency: Frequency | null;
}

export function draftFromSnapshot(displayName: string, rel: RelationshipSnapshot): PersonDraft {
  return {
    displayName,
    category: rel.category,
    alsoCategories: rel.alsoCategories,
    importance: rel.importance,
    // Following the default shows as "Default", not as the default's current value.
    rhythm: rel.rhythmSet && rel.frequency === null ? rel.rhythm : null,
    quality: rel.quality,
    state: rel.state,
    ideal: rel.idealSet ? rel.ideal : undefined,
    frequency: rel.rhythmSet ? rel.frequency : null,
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
  if (draft.importance !== rel.importance) changes.push({ field: 'importance', value: draft.importance, scale: 10 });
  // Rhythm: a custom frequency, a chosen preset, or "follow the default" (both null).
  const own = draftFromSnapshot('', rel);
  if (draft.frequency !== null) {
    if (draft.frequency.times !== own.frequency?.times || draft.frequency.per !== own.frequency?.per) {
      changes.push({ field: 'frequency', value: draft.frequency });
    }
  } else if (draft.rhythm !== null) {
    if (draft.rhythm !== own.rhythm) changes.push({ field: 'rhythm', value: draft.rhythm });
  } else if (rel.rhythmSet) {
    // Back to following the default (a null rhythm also clears any custom frequency).
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
