import {
  forceCollide,
  forceManyBody,
  forceRadial,
  forceSimulation,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Rating } from '@sg/score-engine';

export interface LayoutInput {
  id: string;
  importance: Rating;
}

export interface Point {
  x: number;
  y: number;
}

export const NODE_RADIUS = 18;
export const ME = '__me__';

/** More important relationships sit closer to the user at the centre. */
export function ringRadius(importance: Rating): number {
  return 80 + (5 - importance) * 60;
}

/** Small deterministic PRNG so the same network always produces the same layout. */
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export type SimNode = SimulationNodeDatum & { id: string; importance: Rating | null };

/**
 * The shared ego-centred force model, used by both the one-shot layout and
 * the live simulation: the user is fixed at (0, 0), each person is pulled
 * towards a ring set by importance, and collision prevents overlap. Known
 * people start at their previous positions; newcomers on a golden-angle
 * spiral at their ring. Nodes are sorted by id so the result is
 * independent of input order, and the PRNG is seeded so it is deterministic.
 */
export function createEgoSimulation(
  nodes: LayoutInput[],
  opts: { previous?: Map<string, Point>; seed?: number } = {},
): { simulation: Simulation<SimNode, undefined>; simNodes: SimNode[] } {
  const { previous, seed = 42 } = opts;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const sorted = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const simNodes: SimNode[] = [
    { id: ME, importance: null, x: 0, y: 0, fx: 0, fy: 0 },
    ...sorted.map((n, i) => {
      const prev = previous?.get(n.id);
      const r = ringRadius(n.importance);
      return {
        id: n.id,
        importance: n.importance,
        x: prev?.x ?? r * Math.cos(i * golden),
        y: prev?.y ?? r * Math.sin(i * golden),
      };
    }),
  ];

  const simulation = forceSimulation(simNodes)
    .randomSource(lcg(seed))
    .force(
      'radial',
      forceRadial<SimNode>((d) => (d.importance === null ? 0 : ringRadius(d.importance))).strength(0.8),
    )
    .force('collide', forceCollide<SimNode>(NODE_RADIUS + 12).iterations(2))
    .force('charge', forceManyBody<SimNode>().strength(-20).distanceMax(200))
    .stop();
  return { simulation, simNodes };
}

/** How many of `nodes` already have a position in `previous`. */
export function knownCount(nodes: LayoutInput[], previous?: Map<string, Point>): number {
  return previous ? nodes.filter((n) => previous.has(n.id)).length : 0;
}

/**
 * One-shot layout: runs a fixed number of ticks synchronously (never
 * animates). Reuses cached positions when nobody is new, and warm-starts
 * with fewer ticks when most people are already placed.
 */
export function layoutEgoGraph(
  nodes: LayoutInput[],
  opts: { previous?: Map<string, Point>; ticks?: number; seed?: number } = {},
): Map<string, Point> {
  const { previous } = opts;
  const known = knownCount(nodes, previous);
  if (previous && nodes.length > 0 && known === nodes.length) {
    return new Map(nodes.map((n) => [n.id, previous.get(n.id)!]));
  }
  const ticks = opts.ticks ?? (known >= nodes.length * 0.8 ? 40 : 120);

  const { simulation, simNodes } = createEgoSimulation(nodes, opts);
  // Cool down fully within `ticks` steps (d3 default needs ~300).
  simulation.alphaDecay(1 - Math.pow(0.001, 1 / ticks)).tick(ticks);
  return toPositions(simNodes);
}

export function toPositions(simNodes: SimNode[]): Map<string, Point> {
  const out = new Map<string, Point>();
  for (const n of simNodes) if (n.id !== ME) out.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  return out;
}
