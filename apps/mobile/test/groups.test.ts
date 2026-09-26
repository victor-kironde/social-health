import { describe, expect, it } from 'vitest';
import { logFromRows, toRow } from '../src/data/codec';
import { eraseFromLog } from '../src/data/erase';
import { groupEvent, groupsFromEvents, membership, validateGroup, type PersonGroup } from '../src/data/groups';

const g = (id: string, name: string, members: string[]): PersonGroup => ({ id, name, members, createdAt: 0 });

describe('groups', () => {
  it('keeps the latest record of each group, sorted by name, and ignores them in the scoring log', () => {
    const events = [groupEvent(g('a', 'Uni', ['p1']), 1), groupEvent(g('b', 'Book club', ['p2']), 2), groupEvent(g('a', 'Uni friends', ['p1', 'p3']), 3)];
    const groups = groupsFromEvents(events);
    expect(groups.map((x) => x.name)).toEqual(['Book club', 'Uni friends']);
    expect(groups[1]!.members).toEqual(['p1', 'p3']);
    // One stable row per group, so saving replaces it.
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
    expect(logFromRows(events.map(toRow)).people).toEqual([]);
  });

  it('validates names: required, short, and unique ignoring case', () => {
    const existing = [g('a', 'Book club', [])];
    expect(validateGroup('  ', existing)).toMatch(/name/);
    expect(validateGroup('x'.repeat(41), existing)).toMatch(/under/);
    expect(validateGroup('book CLUB', existing)).toMatch(/already/);
    expect(validateGroup('Book club', existing, 'a')).toBeNull(); // renaming itself
    expect(validateGroup('Running', existing)).toBeNull();
  });

  it('lists the groups each person is in', () => {
    const m = membership([g('a', 'A', ['p1', 'p2']), g('b', 'B', ['p2'])]);
    expect(m.get('p2')).toEqual(['a', 'b']);
    expect(m.get('p3')).toBeUndefined();
  });

  it('erasing a person removes them from every group, and keeps the group', () => {
    const events = [groupEvent(g('a', 'Uni', ['p1', 'p2']), 1), groupEvent(g('b', 'Solo', ['p1']), 2)];
    const { remove, replace } = eraseFromLog(events, 'p1');
    expect(remove).toEqual([]);
    expect(replace.map((e) => (e.body as PersonGroup).members)).toEqual([['p2'], []]);
  });
});

describe('groups as relationships', () => {
  const ids = () => {
    let n = 0;
    return () => `g${n++}`;
  };

  it('a group gets its own entry (kind group, type Other) and is scored like a person', async () => {
    const { groupEntityEvents } = await import('../src/data/groups');
    const { computeScore, DEFAULT_CONFIG } = await import('@sg/score-engine');
    const { newInteractionEvents } = await import('../src/data/interactions');
    const now = Date.UTC(2026, 9, 11);
    const next = ids();
    const events = [
      ...groupEntityEvents({ id: 'patients', name: 'Patients' }, now - 100 * 86_400_000, next),
      ...newInteractionEvents({ participants: ['patients'], type: 'in_person', daysAgo: 2, newPeople: 5 }, now, 0, next),
    ];
    const log = logFromRows(events.map(toRow));
    expect(log.people[0]).toMatchObject({ id: 'patients', kind: 'group', displayName: 'Patients' });
    expect(log.interactions[0]!.newPeople).toBe(5);
    const r = computeScore(log, DEFAULT_CONFIG, now).relationships[0]!;
    expect(r.personId).toBe('patients');
    expect(r.category).toBe('other');
    expect(r.lastContactAgeDays).toBeCloseTo(2, 6);
  });

  it('a rename keeps it a group', async () => {
    const { groupEntityEvents, groupRenameEvent } = await import('../src/data/groups');
    const next = ids();
    const log = logFromRows([...groupEntityEvents({ id: 'g', name: 'Club' }, 1, next), groupRenameEvent('g', 'Book club', 2, next)].map(toRow));
    expect(log.people[0]).toMatchObject({ kind: 'group', displayName: 'Book club' });
  });

  it('people named at a group catch-up join it; groups and existing members are not added', async () => {
    const { joinFromCatchUp } = await import('../src/data/groups');
    const groups = [g('patients', 'Patients', ['ana']), g('team', 'Team', [])];
    const joined = joinFromCatchUp(groups, ['patients', 'ana', 'ben', 'team']);
    expect(joined).toHaveLength(2);
    expect(joined.find((x) => x.id === 'patients')!.members).toEqual(['ana', 'ben']);
    expect(joined.find((x) => x.id === 'team')!.members).toEqual(['ana', 'ben']);
    expect(joinFromCatchUp(groups, ['ana', 'ben'])).toEqual([]); // no group there
  });

  it('rejects a bad count of new people', async () => {
    const { validateInteraction } = await import('../src/data/interactions');
    expect(validateInteraction({ participants: ['g'], type: 'in_person', daysAgo: 0, newPeople: -1 })).toMatch(/new people/);
    expect(validateInteraction({ participants: ['g'], type: 'in_person', daysAgo: 0, newPeople: 1.5 })).toMatch(/new people/);
    expect(validateInteraction({ participants: ['g'], type: 'in_person', daysAgo: 0, newPeople: 12 })).toBeNull();
  });
});
