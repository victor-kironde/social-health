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

  const drafts = new Map<string, Omit<RelationshipSnapshot, 'rhythm' | 'rhythmSet'> & { rhythm: Rhythm | null }>();
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
        ideal: 10,
        idealSet: false,
        frequency: null,
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
        // The latest choice wins: picking a preset rhythm (or "follow the default") replaces any custom frequency.
        draft.frequency = null;
        break;
      case 'state':
        draft.state = e.value;
        break;
      case 'alsoCategories':
        draft.alsoCategories = [...new Set(e.value)].sort();
        break;
      case 'frequency':
        draft.frequency =
          e.value === null ? null : { per: e.value.per, times: Math.min(31, Math.max(1, Math.round(e.value.times))) };
        break;
      case 'ideal':
        draft.ideal = e.value === null ? null : Math.min(10, Math.max(1, Math.round(e.value)));
        draft.idealSet = true;
        break;
    }
  }

  const result = new Map<string, RelationshipSnapshot>();
  for (const [id, d] of drafts) {
    result.set(id, {
      ...d,
      // The primary type is never repeated among the others, whichever changed last.
      alsoCategories: d.alsoCategories.filter((c) => c !== d.category),
      // Not chosen (no rhythm and no custom frequency): follow the default, which may itself be custom.
      rhythmSet: d.rhythm !== null || d.frequency !== null,
      rhythm: d.rhythm ?? config.defaultRhythm[d.category],
      frequency: d.rhythm !== null || d.frequency !== null ? d.frequency : config.defaultFrequency,
    });
  }
  return result;
}
