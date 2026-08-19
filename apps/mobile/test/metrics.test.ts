import { describe, expect, it } from 'vitest';
import { networkMetrics, type MetricTie } from '../src/graph/metrics';

const tie = (a: string, b: string, weight = 1): MetricTie => ({ a, b, weight });

/** Two triangles {a,b,c} and {x,y,z} joined through a bridge person m: c - m - x. */
const ids = ['a', 'b', 'c', 'm', 'x', 'y', 'z'];
const ties = [tie('a', 'b'), tie('b', 'c'), tie('a', 'c'), tie('x', 'y'), tie('y', 'z'), tie('x', 'z'), tie('c', 'm'), tie('m', 'x')];

describe('networkMetrics on two groups joined by a bridge', () => {
  const m = networkMetrics(ids, ties);

  it('counts degree and strength', () => {
    expect(m.nodes.get('a')!.degree).toBe(2);
    expect(m.nodes.get('c')!.degree).toBe(3);
    expect(m.nodes.get('m')!.strength).toBe(2);
  });

  it('local clustering: 1 inside a triangle, 0 for the bridge, 1/3 at the junction', () => {
    expect(m.nodes.get('a')!.clustering).toBe(1);
    expect(m.nodes.get('m')!.clustering).toBe(0);
    expect(m.nodes.get('c')!.clustering).toBeCloseTo(1 / 3, 12);
  });

  it('betweenness is highest for the bridge, zero at the edges of the groups', () => {
    const b = (id: string) => m.nodes.get(id)!.betweenness;
    expect(b('m')).toBeGreaterThan(b('c'));
    expect(b('c')).toBeGreaterThan(b('a'));
    expect(b('a')).toBe(0);
    // m lies on every shortest path between the 3 left and 3 right people: 9 of 15 pairs.
    expect(b('m')).toBeCloseTo(9 / 15, 12);
  });

  it('finds the two triangles as communities, with positive modularity', () => {
    const g = (id: string) => m.nodes.get(id)!.group;
    expect(g('a')).toBe(g('b'));
    expect(g('a')).toBe(g('c'));
    expect(g('x')).toBe(g('y'));
    expect(g('x')).toBe(g('z'));
    expect(g('a')).not.toBe(g('x'));
    expect(m.modularity).toBeGreaterThan(0.3);
  });

  it('marks people whose ties reach another group', () => {
    const touched = (id: string) => m.nodes.get(id)!.groupsTouched;
    expect(touched('a')).toBe(1);
    // m sits in one triangle's group and is tied into the other.
    expect(touched('m')).toBe(2);
    // The bridge joins one of the triangles' groups, so group sizes are 4 and 3.
    for (const id of ids) {
      const g = m.nodes.get(id)!.group;
      expect(m.nodes.get(id)!.groupSize).toBe(ids.filter((o) => m.nodes.get(o)!.group === g).length);
    }
    expect(ids.map((id) => m.nodes.get(id)!.groupSize).sort()).toEqual([3, 3, 3, 4, 4, 4, 4]);
  });

  it('network-level measures', () => {
    expect(m.size).toBe(7);
    expect(m.ties).toBe(8);
    expect(m.density).toBeCloseTo(8 / 21, 12);
    expect(m.effectiveSize).toBeCloseTo(7 - 16 / 7, 12);
    expect(m.isolates).toBe(0);
    expect(m.groups).toBe(2);
  });
});

describe('edge cases', () => {
  it('nobody tied: everyone isolated, maximal effective size, no groups', () => {
    const m = networkMetrics(['a', 'b', 'c'], []);
    expect(m.isolates).toBe(3);
    expect(m.groups).toBe(0);
    expect(m.effectiveSize).toBe(3);
    expect(m.efficiency).toBe(1);
    expect(m.modularity).toBe(0);
  });

  it('everyone tied to everyone: one group, efficiency at its minimum', () => {
    const people = ['a', 'b', 'c', 'd'];
    const all = people.flatMap((p, i) => people.slice(i + 1).map((q) => tie(p, q)));
    const m = networkMetrics(people, all);
    expect(m.density).toBe(1);
    expect(m.groups).toBe(1);
    expect(m.effectiveSize).toBeCloseTo(1, 12); // n - (n - 1)
  });

  it('is deterministic and ignores self-ties and ties to unknown people', () => {
    const extra = [...ties, tie('a', 'a'), tie('a', 'ghost')];
    const m1 = networkMetrics(ids, extra);
    const m2 = networkMetrics([...ids].reverse(), [...extra].reverse());
    expect(m1.ties).toBe(8);
    for (const id of ids) expect(m2.nodes.get(id)).toEqual(m1.nodes.get(id));
  });

  it('empty network', () => {
    const m = networkMetrics([], []);
    expect(m.size).toBe(0);
    expect(m.density).toBe(0);
  });
});
