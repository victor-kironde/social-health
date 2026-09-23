import type { Rating, RelationshipContribution } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import {
  MAX_NODE_RADIUS,
  MIN_NODE_RADIUS,
  TIER_LABELS,
  TIER_SET_LINK,
  nodeRadii,
  orderTiers,
  spanningEdges,
  tierLayout,
} from '../src/graph/arrange';
import { NODE_RADIUS } from '../src/graph/layout';

function rel(personId: string, over: Partial<RelationshipContribution> = {}): RelationshipContribution {
  return {
    personId,
    category: 'friend',
    alsoCategories: [],
    importance: 3,
    quality: null,
    rhythm: 'monthly',
    state: 'active',
    ideal: 10,
    idealSet: false,
    frequency: null,
    rhythmSet: false,
    included: true,
    expectedIntervalDays: 30,
    level: 0,
    onRhythm: null,
    lastContactAgeDays: null,
    callLevel: null,
    frecency: 0,
    ...over,
  };
}

describe('nodeRadii', () => {
  it('sizes by frequency, largest for the most in touch, and grows with frecency', () => {
    const r = nodeRadii([rel('a', { frecency: 0 }), rel('b', { frecency: 1 }), rel('c', { frecency: 4 })], true);
    expect(r.get('a')).toBe(MIN_NODE_RADIUS);
    expect(r.get('c')).toBe(MAX_NODE_RADIUS);
    expect(r.get('b')!).toBeGreaterThan(r.get('a')!);
    expect(r.get('b')!).toBeLessThan(r.get('c')!);
  });

  it('is uniform when switched off or when nobody has been contacted', () => {
    expect(new Set(nodeRadii([rel('a', { frecency: 3 }), rel('b')], false).values())).toEqual(new Set([NODE_RADIUS]));
    const none = nodeRadii([rel('a'), rel('b')], true);
    expect(none.get('a')).toBe(none.get('b'));
  });
});

describe('orderTiers', () => {
  it('importance is used as is', () => {
    expect(orderTiers([rel('a', { importance: 5 })], 'importance').get('a')).toBe(5);
  });

  it('last contact buckets by age, never-contacted last', () => {
    const t = orderTiers(
      [rel('w', { lastContactAgeDays: 2 }), rel('m', { lastContactAgeDays: 20 }), rel('q', { lastContactAgeDays: 80 }), rel('o', { lastContactAgeDays: 400 }), rel('n')],
      'recent',
    );
    expect(['w', 'm', 'q', 'o', 'n'].map((id) => t.get(id))).toEqual([5, 4, 3, 2, 1]);
  });

  it('frequency ranks the contacted into tiers 5..2 and puts the never-contacted in 1', () => {
    const rels = Array.from({ length: 8 }, (_, i) => rel(`p${i}`, { frecency: 8 - i }));
    const t = orderTiers([...rels, rel('none')], 'frequency');
    expect(t.get('p0')).toBe(5);
    expect(t.get('p7')).toBe(2);
    expect(t.get('none')).toBe(1);
    const tiers = rels.map((r) => t.get(r.personId)!);
    expect(tiers).toEqual([...tiers].sort((a, b) => b - a)); // more in touch never ranks lower
  });
});

describe('tierLayout', () => {
  const node = (id: string, tier: Rating, cat: 'family' | 'work' | 'friend', label = id) => ({
    id,
    tier,
    categories: [cat],
    label,
    radius: 18,
  });

  it('puts higher tiers above lower ones, below you, with a labelled row each', () => {
    const { positions, rows } = tierLayout([node('a', 5, 'family'), node('b', 1, 'work'), node('c', 3, 'friend')], TIER_LABELS.importance);
    expect(positions.get('a')!.y).toBeGreaterThan(0);
    expect(positions.get('a')!.y).toBeLessThan(positions.get('c')!.y);
    expect(positions.get('c')!.y).toBeLessThan(positions.get('b')!.y);
    expect(rows.map((r) => r.label)).toEqual(['Essential', 'Important', 'Light']);
  });

  it('groups a row by type, then name, centred under you, and never overlaps', () => {
    const { positions } = tierLayout(
      [node('z', 4, 'work', 'Zed'), node('y', 4, 'family', 'Bea'), node('x', 4, 'family', 'Al')],
      TIER_LABELS.importance,
    );
    const xs = ['x', 'y', 'z'].map((id) => positions.get(id)!.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[0]! + xs[2]!).toBeCloseTo(0, 9);
    expect(xs[1]! - xs[0]!).toBeGreaterThan(36);
  });

  it('set links join neighbours in a row but never cross rows, whatever the sizes', () => {
    const sizes = [MIN_NODE_RADIUS, MAX_NODE_RADIUS];
    for (const r of sizes) {
      const nodes = Array.from({ length: 24 }, (_, i) => ({ ...node(`p${i}`, ((i % 3) + 3) as Rating, 'friend'), radius: r }));
      const pos = [...tierLayout(nodes, TIER_LABELS.importance).positions.values()];
      for (const a of pos) for (const b of pos) {
        if (a === b) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (a.y === b.y && Math.abs(a.x - b.x) <= 2 * r + 14 + 1e-9) expect(d).toBeLessThanOrEqual(TIER_SET_LINK);
        if (a.y !== b.y) expect(d).toBeGreaterThan(TIER_SET_LINK);
      }
    }
  });

  it('wraps long rows onto more lines', () => {
    const many = Array.from({ length: 25 }, (_, i) => node(`p${i}`, 3, 'friend'));
    const ys = new Set([...tierLayout(many, TIER_LABELS.importance).positions.values()].map((p) => p.y));
    expect(ys.size).toBe(3);
  });
});

describe('spanningEdges', () => {
  it('connects n points with n-1 shortest edges', () => {
    // A line of points 0..3 at x = 0, 10, 20, 30 (stored out of order).
    const xy = [20, 0, 0, 0, 30, 0, 10, 0];
    const edges = spanningEdges(xy, [0, 1, 2, 3], 100);
    expect(edges.length).toBe(6);
    let total = 0;
    for (let k = 0; k < edges.length; k += 2) total += Math.abs(xy[2 * edges[k]!]! - xy[2 * edges[k + 1]!]!);
    expect(total).toBe(30);
  });

  it('leaves far-apart islands unconnected', () => {
    const xy = [0, 0, 10, 0, 500, 0, 510, 0];
    expect(spanningEdges(xy, [0, 1, 2, 3], 100).length).toBe(4); // two islands, one edge each
  });

  it('only uses the given indices', () => {
    const xy = [0, 0, 5, 0, 10, 0];
    expect(spanningEdges(xy, [0, 2], 100)).toEqual([0, 2]);
  });
});

describe('display filters', () => {
  it('shows someone if any of their types is selected, and applies the other filters', async () => {
    const { DEFAULT_DISPLAY, applyFilters, activeFilterCount } = await import('../src/graph/display');
    const rels = [
      rel('fam', { category: 'family' }),
      rel('both', { category: 'family', alsoCategories: ['work'] }),
      rel('low', { category: 'work', importance: 1, lastContactAgeDays: 3 }),
      rel('behind', { category: 'friend', onRhythm: 0.1, lastContactAgeDays: 50 }),
    ];
    const ids = (o: Partial<typeof DEFAULT_DISPLAY>) => applyFilters(rels, { ...DEFAULT_DISPLAY, ...o }).map((r) => r.personId);
    expect(ids({})).toEqual(['fam', 'both', 'low', 'behind']);
    expect(ids({ categories: ['work'] })).toEqual(['both', 'low']);
    expect(ids({ minImportance: 2 })).not.toContain('low');
    expect(ids({ behindOnly: true })).toEqual(['behind']);
    expect(ids({ hideNeverContacted: true })).toEqual(['low', 'behind']);
    expect(activeFilterCount(DEFAULT_DISPLAY)).toBe(0);
    expect(activeFilterCount({ ...DEFAULT_DISPLAY, categories: ['work'], behindOnly: true })).toBe(2);
  });
});

describe('layoutSignature', () => {
  it('changes when any part changes and separates parts', async () => {
    const { layoutSignature } = await import('../src/graph/arrange');
    expect(layoutSignature(['a', 'b'])).toBe(layoutSignature(['a', 'b']));
    expect(layoutSignature(['a', 'b'])).not.toBe(layoutSignature(['a', 'c']));
    expect(layoutSignature(['ab', 'c'])).not.toBe(layoutSignature(['a', 'bc']));
  });
});
