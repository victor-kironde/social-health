import { DEFAULT_CONFIG, computeScore, resolveRelationships, type RelationshipSnapshot } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { appendToLog, logFromRows, toRow } from '../src/data/codec';
import { draftFromSnapshot, editPersonEvents, newPersonEvents, type NewPersonInput } from '../src/data/people';

const NOW = Date.UTC(2026, 9, 5);

function ids() {
  let n = 0;
  return () => `id-${String(n++).padStart(4, '0')}`;
}

/** Create a person, apply one edit, and return the resolved relationship and name afterwards. */
function roundTrip(input: NewPersonInput, edit: (draft: ReturnType<typeof draftFromSnapshot>) => void) {
  const next = ids();
  const created = newPersonEvents(input, NOW, next);
  let log = logFromRows(created.map(toRow));
  const personId = log.people[0]!.id;
  const rel = resolveRelationships(log.relationshipEvents, DEFAULT_CONFIG, NOW).get(personId)!;
  const draft = draftFromSnapshot(log.people[0]!.displayName, rel);
  edit(draft);
  const events = editPersonEvents(personId, { displayName: log.people[0]!.displayName, rel }, draft, NOW + 1, next);
  log = appendToLog(log, events);
  return {
    events,
    rel: resolveRelationships(log.relationshipEvents, DEFAULT_CONFIG, NOW + 1).get(personId)!,
    name: log.people[0]!.displayName,
    log,
  };
}

const ana: NewPersonInput = { displayName: 'Ana', category: 'friend', importance: 4, quality: 3 };

describe('editPersonEvents', () => {
  it('produces no events when nothing changed', () => {
    expect(roundTrip(ana, () => {}).events).toEqual([]);
  });

  it('records only the fields that changed', () => {
    const { events, rel } = roundTrip(ana, (d) => {
      d.importance = 5;
    });
    expect(events).toHaveLength(1);
    expect(rel.importance).toBe(5);
    expect(rel.quality).toBe(3);
  });

  it('renames the person', () => {
    expect(roundTrip(ana, (d) => (d.displayName = '  Ana B ')).name).toBe('Ana B');
  });

  it('can clear a quality rating', () => {
    expect(roundTrip(ana, (d) => (d.quality = null)).rel.quality).toBeNull();
  });

  it('a default rhythm follows a category change', () => {
    const { rel } = roundTrip(ana, (d) => (d.category = 'work'));
    expect(rel.rhythm).toBe(DEFAULT_CONFIG.defaultRhythm.work);
  });

  it('an explicit rhythm survives a category change', () => {
    const { rel } = roundTrip({ ...ana, rhythm: 'quarterly' }, (d) => (d.category = 'work'));
    expect(rel.rhythm).toBe('quarterly');
  });

  it('choosing "follow default" again clears an explicit rhythm', () => {
    const { rel } = roundTrip({ ...ana, rhythm: 'quarterly' }, (d) => {
      d.rhythm = null;
      d.category = 'family';
    });
    expect(rel.rhythm).toBe(DEFAULT_CONFIG.defaultRhythm.family);
  });

  it('archiving removes the relationship from the score', () => {
    const { log, rel } = roundTrip(ana, (d) => (d.state = 'archived'));
    expect(rel.state).toBe('archived');
    expect(computeScore(log, DEFAULT_CONFIG, NOW + 1).relationships[0]!.included).toBe(false);
  });
});

describe('draftFromSnapshot', () => {
  it('treats a rhythm equal to the category default as "follow default"', () => {
    const rel: RelationshipSnapshot = {
      personId: 'a',
      category: 'friend',
      importance: 3,
      quality: null,
      rhythm: DEFAULT_CONFIG.defaultRhythm.friend,
      state: 'active',
    };
    expect(draftFromSnapshot('Ana', rel).rhythm).toBeNull();
    expect(draftFromSnapshot('Ana', { ...rel, rhythm: 'weekly' }).rhythm).toBe('weekly');
  });
});
