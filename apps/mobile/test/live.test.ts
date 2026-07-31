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
