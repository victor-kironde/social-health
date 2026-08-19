import { describe, expect, it } from 'vitest';
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
