import type { Rating } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { NODE_RADIUS, layoutEgoGraph, ringRadius, type LayoutInput } from '../src/graph/layout';
import {
  distToQuad,
  distToSegment,
  fitScale,
  hitTest,
  hitTestEdge,
  screenToGraph,
  tieControl,
} from '../src/graph/geometry';

function network(n: number): LayoutInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(3, '0')}`, importance: ((i % 5) + 1) as Rating }));
}

function minDistance(points: { x: number; y: number }[]): number {
  let min = Infinity;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      min = Math.min(min, Math.hypot(points[i]!.x - points[j]!.x, points[i]!.y - points[j]!.y));
    }
  }
  return min;
}

describe('layoutEgoGraph', () => {
  it('is deterministic and independent of input order', () => {
    const nodes = network(40);
    const a = layoutEgoGraph(nodes);
    const b = layoutEgoGraph([...nodes].reverse());
    for (const [id, p] of a) expect(b.get(id)).toEqual(p);
  });

  it('places more important people closer to the centre on average', () => {
    const nodes = network(50);
    const pos = layoutEgoGraph(nodes);
    const meanR = (imp: number) => {
      const rs = nodes.filter((n) => n.importance === imp).map((n) => Math.hypot(pos.get(n.id)!.x, pos.get(n.id)!.y));
      return rs.reduce((s, r) => s + r, 0) / rs.length;
    };
    for (let imp = 5; imp > 1; imp--) expect(meanR(imp)).toBeLessThan(meanR(imp - 1));
  });

  it('keeps nodes from overlapping at 150 people', () => {
    const pos = layoutEgoGraph(network(150));
    expect(minDistance([...pos.values(), { x: 0, y: 0 }])).toBeGreaterThan(NODE_RADIUS * 2 * 0.9);
  });

  it('stays stable when a person is added', () => {
    const nodes = network(30);
    const before = layoutEgoGraph(nodes);
    const after = layoutEgoGraph([...nodes, { id: 'zz-new', importance: 3 }], { previous: before });
    const moved = nodes.map((n) => Math.hypot(after.get(n.id)!.x - before.get(n.id)!.x, after.get(n.id)!.y - before.get(n.id)!.y));
    const median = [...moved].sort((a, b) => a - b)[Math.floor(moved.length / 2)]!;
    expect(median).toBeLessThan(ringRadius(5) / 2);
  });

  it('lays out 150 people quickly (Node; device timing is measured in the app)', () => {
    const nodes = network(150);
    layoutEgoGraph(nodes); // warm-up
    const start = performance.now();
    layoutEgoGraph(nodes);
    const ms = performance.now() - start;
    console.log(`layout 150 nodes: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(250);
  });
});

describe('geometry', () => {
  const size = { width: 400, height: 800 };

  it('maps the container centre to the graph origin at any zoom', () => {
    expect(screenToGraph({ x: 200, y: 400 }, size, { tx: 0, ty: 0, scale: 2.5 }, 0.7)).toEqual({ x: 0, y: 0 });
  });

  it('inverts pan and zoom', () => {
    const fit = 0.5;
    const view = { tx: 30, ty: -20, scale: 2 };
    // Graph point (100, 50) is drawn at centre + translate + scale * fit * point.
    const screen = { x: 200 + 30 + 2 * fit * 100, y: 400 - 20 + 2 * fit * 50 };
    const g = screenToGraph(screen, size, view, fit);
    expect(g.x).toBeCloseTo(100, 9);
    expect(g.y).toBeCloseTo(50, 9);
  });

  it('hit-tests the nearest node within the radius only', () => {
    const pos = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 30, y: 0 }],
    ]);
    expect(hitTest({ x: 20, y: 0 }, pos, pos.keys(), 25)).toBe('b');
    expect(hitTest({ x: 100, y: 100 }, pos, pos.keys(), 25)).toBeNull();
    expect(hitTest({ x: 20, y: 0 }, pos, ['a'], 25)).toBe('a');
  });

  it('fits every node inside the container', () => {
    const pos = [{ x: -300, y: 10 }, { x: 100, y: 250 }];
    const fit = fitScale(pos, size, 50);
    expect(350 * fit).toBeCloseTo(size.width / 2, 9);
  });
});

describe('layout reuse', () => {
  it('returns cached positions unchanged when nobody is new', () => {
    const nodes = network(150);
    const first = layoutEgoGraph(nodes);
    const start = performance.now();
    const again = layoutEgoGraph(nodes, { previous: first });
    expect(performance.now() - start).toBeLessThan(5);
    for (const [id, p] of first) expect(again.get(id)).toEqual(p);
  });

  it('a warm start still separates a newcomer from everyone else', () => {
    const nodes = network(150);
    const first = layoutEgoGraph(nodes);
    const after = layoutEgoGraph([...nodes, { id: 'zz-new', importance: 4 }], { previous: first });
    expect(minDistance([...after.values(), { x: 0, y: 0 }])).toBeGreaterThan(NODE_RADIUS * 2 * 0.8);
  });
});

describe('edge geometry', () => {
  it('tieControl bows a tie away from the centre', () => {
    const c = tieControl(100, 0, 0, 100); // midpoint (50, 50)
    expect(Math.hypot(c.x, c.y)).toBeGreaterThan(Math.hypot(50, 50));
    const opposite = tieControl(-100, 0, 100, 0); // midpoint at the centre: bows sideways
    expect(Math.abs(opposite.y)).toBeCloseTo(50, 9);
  });

  it('distToSegment measures to the nearest point, clamped to the ends', () => {
    expect(distToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3, 9);
    expect(distToSegment(-4, 3, 0, 0, 10, 0)).toBeCloseTo(5, 9);
  });

  it('distToQuad is ~0 on the curve and positive off it', () => {
    // Curve point at t = 0.5: 0.25*a + 0.5*c + 0.25*b.
    expect(distToQuad(50, 25, 0, 0, 50, 50, 100, 0, 64)).toBeLessThan(0.5);
    expect(distToQuad(50, 0, 0, 0, 50, 50, 100, 0, 64)).toBeCloseTo(25, 0);
  });

  it('hitTestEdge picks the nearest edge within tolerance, following curves', () => {
    const pos = new Map([
      ['me', { x: 0, y: 0 }],
      ['a', { x: 100, y: 0 }],
      ['b', { x: 0, y: 100 }],
    ]);
    const edges = [
      { id: 'ego:a', source: 'me', target: 'a', curved: false },
      { id: 'tie:a|b', source: 'a', target: 'b', curved: true },
    ];
    expect(hitTestEdge({ x: 50, y: 2 }, edges, (id) => pos.get(id), 6)).toBe('ego:a');
    // A point on the bowed tie, well away from the straight chord a-b.
    const c = tieControl(100, 0, 0, 100);
    const onCurve = { x: 0.25 * 100 + 0.5 * c.x, y: 0.25 * 100 + 0.5 * c.y };
    expect(hitTestEdge(onCurve, edges, (id) => pos.get(id), 6)).toBe('tie:a|b');
    expect(hitTestEdge({ x: 50, y: 50 }, edges, (id) => pos.get(id), 6)).toBeNull(); // the chord, not the curve
    expect(hitTestEdge({ x: 300, y: 300 }, edges, (id) => pos.get(id), 6)).toBeNull();
  });
});
