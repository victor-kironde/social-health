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
