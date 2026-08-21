import { describe, expect, it } from 'vitest';
import { matchCalls, type PhoneCall } from '../src/data/callImport';
import { logFromRows, toRow, type StoredEvent } from '../src/data/codec';
import { contactCandidates, filterCandidates, nameKey } from '../src/data/contactsImport';

describe('contactCandidates', () => {
  it('tidies, de-duplicates and sorts names', () => {
    const c = contactCandidates(['  Zoë  Smith ', 'ana', 'Ana', 'Ben', 'zoë smith'], []);
    expect(c.map((x) => x.name)).toEqual(['ana', 'Ben', 'Zoë Smith']);
  });

  it('drops entries without a name (numbers, symbols, blanks)', () => {
    expect(contactCandidates(['+44 7700 900123', '***', '', '   ', 'Ana'], []).map((x) => x.name)).toEqual(['Ana']);
  });

  it('keeps names in any script', () => {
    expect(contactCandidates(['Мария', '李雷', 'Nakato'], []).map((x) => x.name).sort()).toEqual(['Nakato', 'Мария', '李雷'].sort());
  });

  it('marks people already in the network, ignoring case and spacing', () => {
    const c = contactCandidates(['Ana Lopez', 'Ben'], ['  ana   lopez ']);
    expect(c).toEqual([
      { name: 'Ana Lopez', alreadyAdded: true },
      { name: 'Ben', alreadyAdded: false },
    ]);
  });
});

describe('filterCandidates', () => {
  const all = contactCandidates(['Ana Lopez', 'Ben Okello', 'Banana'], []);
  it('matches anywhere in the name, case-insensitively', () => {
    expect(filterCandidates(all, 'ANA').map((x) => x.name)).toEqual(['Ana Lopez', 'Banana']);
    expect(filterCandidates(all, 'okel').map((x) => x.name)).toEqual(['Ben Okello']);
  });

  it('returns everything for an empty query', () => {
    expect(filterCandidates(all, '  ')).toHaveLength(3);
  });
});

describe('nameKey', () => {
  it('normalises case, spacing and Unicode forms', () => {
    expect(nameKey('  ZOË   Smith')).toBe(nameKey('zoë smith'));
  });
});

describe('matchCalls', () => {
  const people = [
    { id: 'p-ana', displayName: 'Ana Lopez' },
    { id: 'p-ben', displayName: 'Ben' },
    { id: 'p-ben2', displayName: 'ben' }, // same name as p-ben: ambiguous
  ];
  const call = (name: string | null, date: number, type: PhoneCall['type'] = 'outgoing', durationSec = 120): PhoneCall => ({
    name,
    date,
    durationSec,
    type,
  });

  it('matches by cached name, ignoring case and spacing', () => {
    const r = matchCalls([call('  ana  LOPEZ', 1000)], people, new Set());
    expect(r.matched).toBe(1);
    expect(r.events[0]!.kind === 'call' && r.events[0]!.body).toMatchObject({ personId: 'p-ana', ts: 1000, direction: 'outgoing' });
  });

  it('skips unnamed callers, people not in the network, ambiguous names and other call types', () => {
    const r = matchCalls([call(null, 1), call('Stranger', 2), call('Ben', 3), call('Ana Lopez', 4, 'other')], people, new Set());
    expect(r.matched).toBe(0);
    expect(r.skipped).toBe(4);
  });

  it('never stores a phone number or the raw caller name', () => {
    const r = matchCalls([call('Ana Lopez', 5)], people, new Set());
    expect(JSON.stringify(r.events)).not.toContain('Lopez');
  });

  it('re-importing the same calls adds nothing', () => {
    const calls = [call('Ana Lopez', 10), call('Ana Lopez', 20, 'missed', 0)];
    const seen = new Set<string>();
    const first = matchCalls(calls, people, seen);
    const second = matchCalls(calls, people, seen);
    expect(first.matched).toBe(2);
    expect(second.matched).toBe(0);
  });

  it('calls appear in the log only once the source is connected, in any order', () => {
    const r = matchCalls([call('Ana Lopez', 10)], people, new Set());
    const source: StoredEvent = { id: 'src', ts: 99, kind: 'source', body: { source: 'call_log' } };
    expect(logFromRows([source, ...r.events].map(toRow)).calls).toHaveLength(1);
    expect(logFromRows([...r.events, source].reverse().map(toRow)).calls).toHaveLength(1);
    expect(logFromRows([].map(toRow)).calls).toBeUndefined();
  });
});
