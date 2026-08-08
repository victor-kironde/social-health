import type { Rating } from '@sg/score-engine';
import { describe, expect, it } from 'vitest';
import { hitTestXY } from '../src/graph/geometry';
import { layoutEgoGraph, ringRadius, type LayoutInput } from '../src/graph/layout';
import { LiveSimulation } from '../src/graph/physics/LiveSimulation';

function network(n: number): LayoutInput[] {
  return Array.from({ length: n }, (_, i) => ({ id: `p${String(i).padStart(3, '0')}`, importance: ((i % 5) + 1) as Rating }));
}

function at(sim: LiveSimulation, id: string) {
  const i = sim.ids.indexOf(id);
  const xy = sim.xy();
  return { x: xy[2 * i]!, y: xy[2 * i + 1]! };
}

describe('LiveSimulation', () => {
  it('settles on its own within a few seconds of frames', () => {
    const sim = new LiveSimulation(network(60));
    let frames = 0;
    while (sim.active && frames < 1000) {
      sim.step();
      frames++;
    }
    expect(sim.active).toBe(false);
    expect(frames).toBeLessThan(400); // under ~7 s at 60 fps
  });

  it('starts at rest when every position is already known', () => {
    const nodes = network(30);
    const sim = new LiveSimulation(nodes, { previous: layoutEgoGraph(nodes) });
    expect(sim.active).toBe(false);
  });

  it('settles into the same ring structure as the one-shot layout', () => {
    const nodes = network(50);
    const sim = new LiveSimulation(nodes);
    sim.settle();
    const meanR = (imp: number) => {
      const ids = nodes.filter((n) => n.importance === imp).map((n) => n.id);
      return ids.reduce((s, id) => s + Math.hypot(at(sim, id).x, at(sim, id).y), 0) / ids.length;
    };
    for (let imp = 5; imp > 1; imp--) expect(meanR(imp)).toBeLessThan(meanR(imp - 1));
  });

  it('a dragged node follows the pointer and stays active while held', () => {
    const sim = new LiveSimulation(network(20));
    sim.settle();
    sim.dragStart('p004', 500, 500);
    sim.step(5);
    expect(at(sim, 'p004')).toEqual({ x: 500, y: 500 });
    sim.step(500);
    expect(sim.active).toBe(true);
    sim.dragMove('p004', 520, 480);
    sim.step();
    expect(at(sim, 'p004')).toEqual({ x: 520, y: 480 });
  });

  it('a released node springs back towards its importance ring', () => {
    const sim = new LiveSimulation(network(20));
    sim.settle();
    const id = 'p004'; // importance 5
    sim.dragStart(id, 600, 0);
    sim.step(20);
    sim.dragEnd(id);
    sim.settle();
    const r = Math.hypot(at(sim, id).x, at(sim, id).y);
    expect(Math.abs(r - ringRadius(5))).toBeLessThan(Math.abs(600 - ringRadius(5)) / 3);
  });

  it('ignores drags for unknown ids or ids not being dragged', () => {
    const sim = new LiveSimulation(network(5));
    sim.settle();
    const before = sim.xy();
    sim.dragMove('p001', 999, 999);
    sim.dragEnd('nope');
    expect(sim.active).toBe(false);
    sim.step();
    const after = sim.xy();
    expect(Math.max(...after.map((v, i) => Math.abs(v - before[i]!)))).toBeLessThan(0.5);
  });
});

describe('hitTestXY', () => {
  const xy = [0, 0, 30, 0, 100, 100];
  it('finds the nearest candidate within the radius', () => {
    expect(hitTestXY(20, 0, xy, [0, 1, 2], 25)).toBe(1);
    expect(hitTestXY(20, 0, xy, [0, 2], 25)).toBe(0);
    expect(hitTestXY(60, 60, xy, [0, 1, 2], 25)).toBe(-1);
  });
});

describe('remembered positions', () => {
  it('records the importance each position was laid out for', () => {
    const nodes = network(10);
    const pos = layoutEgoGraph(nodes);
    for (const n of nodes) expect(pos.get(n.id)!.importance).toBe(n.importance);
  });

  it('a person whose importance changed is not treated as placed, and glides to the new ring', () => {
    const nodes = network(20);
    const remembered = new LiveSimulation(nodes);
    remembered.settle();
    const previous = remembered.positions();

    const changed = nodes.map((n) => (n.id === 'p000' ? { ...n, importance: 5 as Rating } : n)); // was 1
    const sim = new LiveSimulation(changed, { previous });
    expect(sim.active).toBe(true);
    const start = at(sim, 'p000');
    expect(start).toEqual({ x: previous.get('p000')!.x, y: previous.get('p000')!.y }); // starts where it was
    sim.settle();
    const r = Math.hypot(at(sim, 'p000').x, at(sim, 'p000').y);
    expect(Math.abs(r - ringRadius(5))).toBeLessThan(Math.abs(Math.hypot(start.x, start.y) - ringRadius(5)));
  });

  it('the one-shot layout re-runs rather than reusing a position on the wrong ring', () => {
    const nodes = network(10);
    const previous = layoutEgoGraph(nodes);
    const changed = nodes.map((n) => (n.id === 'p000' ? { ...n, importance: 5 as Rating } : n));
    const after = layoutEgoGraph(changed, { previous });
    expect(after.get('p000')).not.toEqual(previous.get('p000'));
    expect(after.get('p000')!.importance).toBe(5);
  });
});

describe('after a drag', () => {
  it('settles within ~150 ticks of release', () => {
    const sim = new LiveSimulation(network(30));
    sim.settle();
    sim.dragStart('p003', 400, 0);
    sim.step(30);
    sim.dragEnd('p003');
    let ticks = 0;
    while (sim.active && ticks < 1000) {
      sim.step();
      ticks++;
    }
    expect(ticks).toBeLessThan(150);
  });

  it('flush() ends a drag in progress and returns settled positions', () => {
    const sim = new LiveSimulation(network(30));
    sim.dragStart('p003', 400, 0);
    sim.step(10);
    const pos = sim.flush();
    expect(sim.active).toBe(false);
    expect(pos.size).toBe(30);
    expect(Math.hypot(pos.get('p003')!.x, pos.get('p003')!.y)).toBeLessThan(400);
  });
});

describe('ties in the layout', () => {
  const dist = (sim: LiveSimulation, a: string, b: string) =>
    Math.hypot(at(sim, a).x - at(sim, b).x, at(sim, a).y - at(sim, b).y);

  it('pulls tied people closer together than untied people on the same ring', () => {
    // 30 people, all importance 3 (same ring); tie three pairs strongly.
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `q${String(i).padStart(2, '0')}`, importance: 3 as Rating }));
    const links = [
      { source: 'q00', target: 'q15', weight: 3 },
      { source: 'q05', target: 'q20', weight: 3 },
      { source: 'q10', target: 'q25', weight: 3 },
    ];
    const tied = new LiveSimulation(nodes, { links });
    tied.settle();
    const untied = new LiveSimulation(nodes);
    untied.settle();
    for (const l of links) expect(dist(tied, l.source, l.target)).toBeLessThan(dist(untied, l.source, l.target) / 2);
  });

  it('keeps importance rings ordered with ties present', () => {
    const nodes = network(50);
    const links = nodes.slice(0, 20).map((n, i) => ({ source: n.id, target: nodes[(i + 7) % 50]!.id, weight: 2 }));
    const sim = new LiveSimulation(nodes, { links });
    sim.settle();
    const meanR = (imp: number) => {
      const ids = nodes.filter((n) => n.importance === imp).map((n) => n.id);
      return ids.reduce((s, id) => s + Math.hypot(at(sim, id).x, at(sim, id).y), 0) / ids.length;
    };
    for (let imp = 5; imp > 1; imp--) expect(meanR(imp)).toBeLessThan(meanR(imp - 1));
  });

  it('ignores links to people not in the graph', () => {
    const sim = new LiveSimulation(network(5), { links: [{ source: 'p000', target: 'ghost', weight: 5 }] });
    sim.settle();
    expect(sim.xy().every(Number.isFinite)).toBe(true);
  });

  it('warm: a fully remembered layout relaxes when asked (ties changed)', () => {
    const nodes = network(20);
    const previous = layoutEgoGraph(nodes);
    expect(new LiveSimulation(nodes, { previous }).active).toBe(false);
    expect(new LiveSimulation(nodes, { previous, warm: true }).active).toBe(true);
  });
});
