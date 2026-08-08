import { DAY, type Interaction } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { deriveTies, tieSignature } from '../src/graph/ties';

const NOW = Date.UTC(2026, 9, 6);
let n = 0;
function meet(participants: string[], daysAgo = 0): Interaction {
  const ts = NOW - daysAgo * DAY;
  return { id: `x${n++}`, ts, loggedAt: ts, type: 'in_person', participants, source: 'manual' };
}
const everyone = new Set(['a', 'b', 'c', 'd', 'e']);

describe('deriveTies', () => {
  it('ties people who appear together, and nobody else', () => {
    const ties = deriveTies([meet(['a', 'b']), meet(['c'])], NOW, everyone);
    expect(ties).toHaveLength(1);
    expect(ties[0]).toMatchObject({ a: 'a', b: 'b', weight: 1, count: 1 });
  });

  it('is symmetric and ignores participant order and duplicates', () => {
    const t1 = deriveTies([meet(['b', 'a', 'a'])], NOW, everyone);
    const t2 = deriveTies([meet(['a', 'b'])], NOW, everyone);
    expect(t1).toEqual(t2);
  });

  it('accumulates repeated meetings', () => {
    const ties = deriveTies([meet(['a', 'b']), meet(['a', 'b']), meet(['a', 'b'])], NOW, everyone);
    expect(ties[0]!.weight).toBeCloseTo(3, 9);
    expect(ties[0]!.count).toBe(3);
  });

  it('discounts large groups so one gathering does not tie everyone strongly', () => {
    const pair = deriveTies([meet(['a', 'b'])], NOW, everyone)[0]!.weight;
    const group = deriveTies([meet(['a', 'b', 'c', 'd', 'e'])], NOW, everyone, { minWeight: 0 });
    expect(group).toHaveLength(10);
    for (const t of group) expect(t.weight).toBeCloseTo(pair / 4, 9);
  });

  it('decays with age (half-life 90 days)', () => {
    const ties = deriveTies([meet(['a', 'b'], 90)], NOW, everyone);
    expect(ties[0]!.weight).toBeCloseTo(0.5, 9);
  });

  it('drops weak ties and ignores future interactions', () => {
    expect(deriveTies([meet(['a', 'b'], 400)], NOW, everyone)).toEqual([]);
    expect(deriveTies([meet(['a', 'b'], -1)], NOW, everyone)).toEqual([]);
  });

  it('only ties people in the given set (e.g. not archived ones)', () => {
    const ties = deriveTies([meet(['a', 'b', 'z'])], NOW, new Set(['a', 'z']));
    expect(ties.map((t) => [t.a, t.b])).toEqual([['a', 'z']]);
  });

  it('records the most recent shared contact', () => {
    const ties = deriveTies([meet(['a', 'b'], 10), meet(['a', 'b'], 2)], NOW, everyone);
    expect(ties[0]!.lastTs).toBe(NOW - 2 * DAY);
  });
});

describe('tieSignature', () => {
  it('depends on which pairs are tied, not on order or weight', () => {
    const x = deriveTies([meet(['a', 'b']), meet(['c', 'd'])], NOW, everyone);
    const y = deriveTies([meet(['c', 'd']), meet(['c', 'd']), meet(['a', 'b'])], NOW, everyone);
    expect(tieSignature(x)).toBe(tieSignature(y));
  });
});
