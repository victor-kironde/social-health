import { DEFAULT_CONFIG, computeScore, resolveRelationships } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { appendToLog, emptyLog, fromRow, logFromRows, toRow, type StoredEvent } from '../src/data/codec';
import { newPersonEvents, validatePerson, type NewPersonInput } from '../src/data/people';

const NOW = Date.UTC(2026, 9, 5);

function ids() {
  let n = 0;
  return () => `id-${String(n++).padStart(4, '0')}`;
}

const ana: NewPersonInput = { displayName: '  Ana ', category: 'friend', importance: 5, quality: null };

describe('codec', () => {
  it('round-trips every event through a row', () => {
    const events: StoredEvent[] = [
      ...newPersonEvents(ana, NOW, ids()),
      {
        id: 'x',
        ts: NOW,
        kind: 'interaction',
        body: { id: 'x', ts: NOW, loggedAt: NOW, type: 'video', participants: ['a'], source: 'manual' },
      },
      { id: 'p', ts: NOW, kind: 'pause', body: { from: NOW, to: null } },
    ];
    for (const e of events) expect(fromRow(toRow(e))).toEqual(e);
  });

  it('ignores unknown kinds written by a newer version', () => {
    expect(fromRow({ id: 'z', kind: 'from-the-future', ts: NOW, body: '{}' })).toBeNull();
  });

  it('rebuilds the same log regardless of row order', () => {
    const rows = newPersonEvents(ana, NOW, ids()).map(toRow);
    expect(logFromRows([...rows].reverse())).toEqual(logFromRows(rows));
  });

  it('appendToLog does not mutate its input', () => {
    const log = emptyLog();
    appendToLog(log, newPersonEvents(ana, NOW, ids()));
    expect(log).toEqual(emptyLog());
  });

  it('a later person event replaces the profile (rename)', () => {
    const log = appendToLog(emptyLog(), [
      { id: '1', ts: NOW, kind: 'person', body: { id: 'a', displayName: 'Ana' } },
      { id: '2', ts: NOW + 1, kind: 'person', body: { id: 'a', displayName: 'Ana B' } },
    ]);
    expect(log.people).toEqual([{ id: 'a', displayName: 'Ana B' }]);
  });
});

describe('newPersonEvents', () => {
  it('records the person and their relationship attributes, trimming the name', () => {
    const log = logFromRows(newPersonEvents({ ...ana, quality: 4 }, NOW, ids()).map(toRow));
    expect(log.people).toHaveLength(1);
    expect(log.people[0]!.displayName).toBe('Ana');
    const rel = resolveRelationships(log.relationshipEvents, DEFAULT_CONFIG, NOW).get(log.people[0]!.id);
    expect(rel).toMatchObject({ category: 'friend', importance: 5, quality: 4, rhythm: 'monthly', state: 'active' });
  });

  it('does not store a rhythm that equals the category default', () => {
    const events = newPersonEvents({ ...ana, rhythm: DEFAULT_CONFIG.defaultRhythm.friend }, NOW, ids());
    expect(events.some((e) => e.kind === 'relationship' && e.body.field === 'rhythm')).toBe(false);
  });

  it('stores a chosen non-default rhythm', () => {
    const events = newPersonEvents({ ...ana, rhythm: 'weekly' }, NOW, ids());
    expect(events.some((e) => e.kind === 'relationship' && e.body.field === 'rhythm' && e.body.value === 'weekly')).toBe(true);
  });

  it('new people score as never contacted', () => {
    const log = logFromRows(newPersonEvents(ana, NOW, ids()).map(toRow));
    const r = computeScore(log, DEFAULT_CONFIG, NOW);
    expect(r.relationships[0]!.lastContactAgeDays).toBeNull();
    expect(r.components.coverage).toBe(0);
  });
});

describe('validatePerson', () => {
  it('requires a non-blank name', () => {
    expect(validatePerson({ ...ana, displayName: '   ' })).toMatch(/name/i);
    expect(validatePerson(ana)).toBeNull();
  });

  it('limits name length', () => {
    expect(validatePerson({ ...ana, displayName: 'x'.repeat(61) })).toMatch(/under/);
  });
});
