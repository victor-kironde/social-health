import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceRadial,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Category, Rating } from '@sg/score-engine';

export interface LayoutInput {
  id: string;
  importance: Rating;
  /** Drawn radius (e.g. sized by contact frequency); collision spacing uses it. Default NODE_RADIUS. */
  radius?: number;
  /** Relationship types, primary first. When given, people are pulled towards their types' sectors. */
  categories?: Category[];
  /** Extra distance beyond their ring (e.g. lost touch drifts outward). Default 0. */
  outward?: number;
}

/** Fixed order of type sectors around the circle, so a type always sits in the same direction. */
export const SECTOR_ORDER: Category[] = ['family', 'friend', 'work', 'neighbour', 'community'];
/** Gentle pull towards the sector target: rings stay dominant, types group together. */
const SECTOR_STRENGTH = 0.12;
/** Primary type counts a little more than "also" types when averaging directions. */
const PRIMARY_WEIGHT = 1.5;

/** Angle of each type present, evenly spaced, starting at the top and going clockwise. */
export function sectorAngles(present: Category[]): Map<Category, number> {
  const types = SECTOR_ORDER.filter((c) => present.includes(c));
  return new Map(types.map((c, k) => [c, -Math.PI / 2 + (2 * Math.PI * k) / types.length]));
}

/** Direction for someone with these types: weighted circular mean of their sectors. */
export function sectorDirection(categories: Category[], angles: Map<Category, number>): number | null {
  if (!categories.length) return null;
  let x = 0;
  let y = 0;
  categories.forEach((c, i) => {
    const a = angles.get(c);
    if (a === undefined) return;
    const w = i === 0 ? PRIMARY_WEIGHT : 1;
    x += w * Math.cos(a);
    y += w * Math.sin(a);
  });
  // Opposite types can cancel out; fall back to the primary type's direction.
  if (Math.hypot(x, y) < 1e-6) return angles.get(categories[0]!) ?? null;
  return Math.atan2(y, x);
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

export type SimNode = SimulationNodeDatum & {
  id: string;
  importance: Rating | null;
  radius: number;
  /** Extra distance beyond the importance ring. */
  outward: number;
  /** Sector target (on the importance ring), when types are known. */
  tx?: number;
  ty?: number;
};

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
  const angles = sectorAngles([...new Set(nodes.flatMap((n) => n.categories ?? []))]);
  const simNodes: SimNode[] = [
    { id: ME, importance: null, radius: NODE_RADIUS + 4, outward: 0, x: 0, y: 0, fx: 0, fy: 0 },
    ...sorted.map((n, i) => {
      const prev = previous?.get(n.id);
      const r = ringRadius(n.importance) + (n.outward ?? 0);
      const dir = n.categories ? sectorDirection(n.categories, angles) : null;
      const target = dir === null ? undefined : { x: r * Math.cos(dir), y: r * Math.sin(dir) };
      // Newcomers start near their target (small deterministic jitter so they do not stack).
      const jitter = (i * golden) % (2 * Math.PI);
      return {
        id: n.id,
        importance: n.importance,
        radius: n.radius ?? NODE_RADIUS,
        outward: n.outward ?? 0,
        ...(target ? { tx: target.x, ty: target.y } : {}),
        x: prev?.x ?? (target ? target.x + 6 * Math.cos(jitter) : r * Math.cos(i * golden)),
        y: prev?.y ?? (target ? target.y + 6 * Math.sin(jitter) : r * Math.sin(i * golden)),
      };
    }),
  ];

  const simulation = forceSimulation(simNodes)
    .randomSource(lcg(seed))
    .force(
      'radial',
      forceRadial<SimNode>((d) => (d.importance === null ? 0 : ringRadius(d.importance) + d.outward)).strength(0.8),
    )
    .force('collide', forceCollide<SimNode>((d) => d.radius + 12).iterations(2))
    .force('charge', forceManyBody<SimNode>().strength(-20).distanceMax(200))
    .stop();

  if (simNodes.some((n) => n.tx !== undefined)) {
    simulation
      .force('sectorX', forceX<SimNode>((d) => d.tx ?? d.x ?? 0).strength((d) => (d.tx === undefined ? 0 : SECTOR_STRENGTH)))
      .force('sectorY', forceY<SimNode>((d) => d.ty ?? d.y ?? 0).strength((d) => (d.ty === undefined ? 0 : SECTOR_STRENGTH)));
  }

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
