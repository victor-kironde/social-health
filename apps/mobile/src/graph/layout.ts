import {
  forceCollide,
  forceLink,
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

/** A remembered position, with the importance it was laid out for. */
export interface PlacedPoint extends Point {
  importance?: Rating;
}

/**
 * Whether `n` already has a usable position: remembered, and laid out for
 * its current importance (otherwise it sits on the wrong ring and must move).
 */
export function isPlaced(n: LayoutInput, previous?: Map<string, PlacedPoint>): boolean {
  const p = previous?.get(n.id);
  return p !== undefined && (p.importance === undefined || p.importance === n.importance);
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

/** A person-to-person attraction (from derived ties); weight ~1 = one recent contact as a pair. */
export interface LayoutLink {
  source: string;
  target: string;
  weight: number;
}

/** Ties pull gently (rings stay dominant); stronger ties pull more, capped. */
const linkStrength = (weight: number) => 0.05 + 0.4 * Math.min(1, weight / 3);
const LINK_DISTANCE = 70;

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
  opts: { previous?: Map<string, PlacedPoint>; seed?: number; links?: LayoutLink[] } = {},
): { simulation: Simulation<SimNode, undefined>; simNodes: SimNode[] } {
  const { previous, seed = 42, links = [] } = opts;
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

  const ids = new Set(sorted.map((n) => n.id));
  const usable = links
    .filter((l) => ids.has(l.source) && ids.has(l.target))
    .map((l) => ({ source: l.source, target: l.target, weight: l.weight }));
  if (usable.length) {
    simulation.force(
      'ties',
      forceLink<SimNode, { source: string | SimNode; target: string | SimNode; weight: number }>(usable)
        .id((d) => d.id)
        .distance(LINK_DISTANCE)
        .strength((l) => linkStrength(l.weight)),
    );
  }
  return { simulation, simNodes };
}

/** How many of `nodes` are already placed (see isPlaced). */
export function knownCount(nodes: LayoutInput[], previous?: Map<string, PlacedPoint>): number {
  return previous ? nodes.filter((n) => isPlaced(n, previous)).length : 0;
}

/**
 * One-shot layout: runs a fixed number of ticks synchronously (never
 * animates). Reuses cached positions when nobody is new, and warm-starts
 * with fewer ticks when most people are already placed.
 */
export function layoutEgoGraph(
  nodes: LayoutInput[],
  opts: { previous?: Map<string, PlacedPoint>; ticks?: number; seed?: number; links?: LayoutLink[]; warm?: boolean } = {},
): Map<string, PlacedPoint> {
  const { previous, warm } = opts;
  const known = knownCount(nodes, previous);
  if (previous && nodes.length > 0 && known === nodes.length && !warm) {
    return new Map(nodes.map((n) => [n.id, { ...previous.get(n.id)!, importance: n.importance }]));
  }
  const ticks = opts.ticks ?? (known >= nodes.length * 0.8 ? 40 : 120);

  const { simulation, simNodes } = createEgoSimulation(nodes, opts);
  // Cool down fully within `ticks` steps (d3 default needs ~300).
  simulation.alphaDecay(1 - Math.pow(0.001, 1 / ticks)).tick(ticks);
  return toPositions(simNodes);
}

export function toPositions(simNodes: SimNode[]): Map<string, PlacedPoint> {
  const out = new Map<string, PlacedPoint>();
  for (const n of simNodes) {
    if (n.id !== ME) out.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, importance: n.importance ?? undefined });
  }
  return out;
}
