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
      alsoCategories: [],
      importance: 3,
      quality: null,
      rhythm: DEFAULT_CONFIG.defaultRhythm.friend,
      state: 'active',
      ideal: 10,
      idealSet: false,
      frequency: null,
    };
    expect(draftFromSnapshot('Ana', rel).rhythm).toBeNull();
    expect(draftFromSnapshot('Ana', { ...rel, rhythm: 'weekly' }).rhythm).toBe('weekly');
  });
});

describe('also part of (several relationship types)', () => {
  it('stores other types, never repeating the primary one', () => {
    const { rel } = roundTrip({ ...ana, alsoCategories: ['work', 'friend', 'work'] }, () => {});
    expect(rel.category).toBe('friend');
    expect(rel.alsoCategories).toEqual(['work']);
  });

  it('edits other types, and drops one that becomes the primary', () => {
    const { rel } = roundTrip({ ...ana, alsoCategories: ['work'] }, (d) => {
      d.category = 'work';
      d.alsoCategories = ['work', 'family'];
    });
    expect(rel.category).toBe('work');
    expect(rel.alsoCategories).toEqual(['family']);
  });

  it('records no change when the set is the same in another order', () => {
    const { events } = roundTrip({ ...ana, alsoCategories: ['work', 'family'] }, (d) => {
      d.alsoCategories = ['family', 'work'];
    });
    expect(events).toEqual([]);
  });
});

describe('ideal closeness', () => {
  it('starts not set (counted as 10) and records nothing until chosen', () => {
    const plain = roundTrip(ana, () => {});
    expect(plain.rel.ideal).toBe(10);
    expect(plain.rel.idealSet).toBe(false);
    expect(plain.events).toEqual([]);
  });

  it('choosing 10 explicitly marks it as set', () => {
    const { rel, events } = roundTrip(ana, (d) => (d.ideal = 10));
    expect(events).toHaveLength(1);
    expect(rel.ideal).toBe(10);
    expect(rel.idealSet).toBe(true);
  });

  it('can be lowered, set to "don\'t mind", and back', () => {
    expect(roundTrip(ana, (d) => (d.ideal = 3)).rel.ideal).toBe(3);
    expect(roundTrip(ana, (d) => (d.ideal = null)).rel.ideal).toBeNull();
    expect(roundTrip({ ...ana, ideal: 4 }, (d) => (d.ideal = 10)).rel.ideal).toBe(10);
  });

  it('a new person can start with an ideal', () => {
    expect(roundTrip({ ...ana, ideal: 2 }, () => {}).rel.ideal).toBe(2);
    expect(roundTrip({ ...ana, ideal: null }, () => {}).rel.ideal).toBeNull();
  });
});

describe('custom catch-up frequency', () => {
  it('sets "at least N times a period", and the expected interval follows it', () => {
    const { rel, log } = roundTrip(ana, (d) => (d.frequency = { times: 2, per: 'month' }));
    expect(rel.frequency).toEqual({ times: 2, per: 'month' });
    expect(computeScore(log, DEFAULT_CONFIG, NOW + 1).relationships[0]!.expectedIntervalDays).toBe(15);
  });

  it('records nothing when unchanged, and a change when the count changes', () => {
    const start = { ...ana, frequency: { times: 5, per: 'week' as const } };
    expect(roundTrip(start, () => {}).events).toEqual([]);
    expect(roundTrip(start, (d) => (d.frequency = { times: 3, per: 'week' })).rel.frequency).toEqual({ times: 3, per: 'week' });
  });

  it('going back to a preset clears the custom frequency, even the same preset as before', () => {
    const start = { ...ana, rhythm: 'monthly' as const, frequency: { times: 5, per: 'week' as const } };
    const back = roundTrip(start, (d) => {
      d.frequency = null;
      d.rhythm = 'monthly';
    });
    expect(back.rel.frequency).toBeNull();
    expect(back.rel.rhythm).toBe('monthly');
    const toDefault = roundTrip(start, (d) => {
      d.frequency = null;
      d.rhythm = null;
    });
    expect(toDefault.rel.frequency).toBeNull();
    expect(toDefault.rel.rhythm).toBe(DEFAULT_CONFIG.defaultRhythm.friend);
  });
});

describe('frequency wording', () => {
  it('reads naturally', async () => {
    const { frequencyText, rhythmLabel } = await import('../src/ui/labels');
    expect(frequencyText({ times: 1, per: 'week' })).toBe('At least once a week');
    expect(frequencyText({ times: 2, per: 'month' })).toBe('At least twice a month');
    expect(frequencyText({ times: 5, per: 'week' })).toBe('At least 5 times a week');
    expect(rhythmLabel({ rhythm: 'monthly', frequency: null })).toBe('Monthly');
  });
});
