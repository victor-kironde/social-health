import type { ModelConfig, RelationshipEvent, RelationshipSnapshot, Rhythm, Timestamp } from './types';

/**
 * Fold relationship events up to asOf into the current snapshot per person.
 * Later events win; ties at the same ts are broken by event id so the result
 * does not depend on array order.
 */
export function resolveRelationships(
  events: RelationshipEvent[],
  config: ModelConfig,
  asOf: Timestamp,
): Map<string, RelationshipSnapshot> {
  const ordered = events
    .filter((e) => e.ts <= asOf)
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const drafts = new Map<string, Omit<RelationshipSnapshot, 'rhythm'> & { rhythm: Rhythm | null }>();
  for (const e of ordered) {
    let draft = drafts.get(e.personId);
    if (!draft) {
      draft = {
        personId: e.personId,
        category: 'friend',
        alsoCategories: [],
        importance: 3,
        quality: null,
        rhythm: null,
        state: 'active',
      };
      drafts.set(e.personId, draft);
    }
    switch (e.field) {
      case 'category':
        draft.category = e.value;
        break;
      case 'importance':
        draft.importance = e.value;
        break;
      case 'quality':
        draft.quality = e.value;
        break;
      case 'rhythm':
        draft.rhythm = e.value;
        break;
      case 'state':
        draft.state = e.value;
        break;
      case 'alsoCategories':
        draft.alsoCategories = [...new Set(e.value)].sort();
        break;
    }
  }

  const result = new Map<string, RelationshipSnapshot>();
  for (const [id, d] of drafts) {
    result.set(id, {
      ...d,
      // The primary type is never repeated among the others, whichever changed last.
      alsoCategories: d.alsoCategories.filter((c) => c !== d.category),
      rhythm: d.rhythm ?? config.defaultRhythm[d.category],
    });
  }
  return result;
}
