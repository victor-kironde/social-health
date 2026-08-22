import type { Point } from './layout';

/** Pan/zoom state applied to the graph view, transform-origin at the view centre. */
export interface ViewTransform {
  tx: number;
  ty: number;
  scale: number;
}

/**
 * Maps a point on screen (relative to the graph container) back to graph
 * coordinates. `fit` is pixels per graph unit at scale 1, with graph (0, 0)
 * drawn at the container centre.
 */
export function screenToGraph(
  screen: Point,
  size: { width: number; height: number },
  view: ViewTransform,
  fit: number,
): Point {
  'worklet';
  const cx = size.width / 2;
  const cy = size.height / 2;
  return {
    x: (screen.x - cx - view.tx) / view.scale / fit,
    y: (screen.y - cy - view.ty) / view.scale / fit,
  };
}

/** The id of the nearest node within `radius` of `p`, or null. */
export function hitTest(
  p: Point,
  positions: Map<string, Point>,
  ids: Iterable<string>,
  radius: number | ((id: string) => number),
): string | null {
  let best: string | null = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const q = positions.get(id);
    if (!q) continue;
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= (typeof radius === 'number' ? radius : radius(id)) && d < bestDist) {
      best = id;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Hit test against interleaved positions [x0, y0, x1, y1, ...], considering
 * only `candidates` (indices). Returns the nearest index within `radius`, or
 * -1. Runs on the UI thread (worklet) as well as on JS.
 */
export function hitTestXY(
  px: number,
  py: number,
  xy: number[],
  candidates: number[],
  radius: number,
  /** Per-candidate hit radius (parallel to `candidates`); overrides `radius`. */
  radii?: number[],
): number {
  'worklet';
  let best = -1;
  let bestDist = Infinity;
  for (let k = 0; k < candidates.length; k++) {
    const i = candidates[k]!;
    const d = Math.hypot(px - xy[2 * i]!, py - xy[2 * i + 1]!);
    if (d <= (radii ? radii[k]! : radius) && d < bestDist) {
      best = i;
      bestDist = d;
    }
  }
  return best;
}

/** Pixels per graph unit so that every node (plus `margin` graph units) fits the container. */
export function fitScale(positions: Iterable<Point>, size: { width: number; height: number }, margin: number): number {
  let extent = 0;
  for (const p of positions) extent = Math.max(extent, Math.abs(p.x), Math.abs(p.y));
  const half = Math.min(size.width, size.height) / 2;
  return half / (extent + margin || 1);
}

/**
 * Control point for a tie's quadratic curve: the midpoint pushed away from
 * the centre by a quarter of the tie's length, so ties bow outward around
 * the user rather than cutting through the middle of the graph.
 */
export function tieControl(ax: number, ay: number, bx: number, by: number): Point {
  'worklet';
  const mx = (ax + bx) / 2;
  const my = (ay + by) / 2;
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const r = Math.hypot(mx, my);
  // Midpoint at the centre (diametrically opposite people): bow sideways instead.
  const nx = r < 1e-6 ? -(by - ay) / len : mx / r;
  const ny = r < 1e-6 ? (bx - ax) / len : my / r;
  const bow = 0.25 * len;
  return { x: mx + nx * bow, y: my + ny * bow };
}

export function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  'worklet';
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Distance to a quadratic Bézier, approximated by `steps` straight pieces. */
export function distToQuad(
  px: number,
  py: number,
  ax: number,
  ay: number,
  cx: number,
  cy: number,
  bx: number,
  by: number,
  steps = 16,
): number {
  'worklet';
  let best = Infinity;
  let x0 = ax;
  let y0 = ay;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const x1 = u * u * ax + 2 * u * t * cx + t * t * bx;
    const y1 = u * u * ay + 2 * u * t * cy + t * t * by;
    best = Math.min(best, distToSegment(px, py, x0, y0, x1, y1));
    x0 = x1;
    y0 = y1;
  }
  return best;
}

/** How edges are routed between their endpoints. */
export type EdgeRouting = 'orthogonal' | 'curved';

/** Straight pieces used to approximate a curved tie. */
const CURVE_SEGMENTS = 6;

/**
 * The polyline an edge is drawn along, as flat [x0, y0, x1, y1, ...].
 *
 * orthogonal (default): only horizontal and vertical segments with right
 * angles. A line from the user leaves the centre along its dominant axis and
 * turns once; a tie turns once at the corner farther from the centre, which
 * keeps ties out of the middle of the graph.
 * curved: ego edges straight, ties bowed outward (tieControl), sampled.
 */
export function routeEdge(
  kind: 'ego' | 'tie',
  ax: number,
  ay: number,
  bx: number,
  by: number,
  routing: EdgeRouting,
): number[] {
  'worklet';
  if (routing === 'curved') {
    if (kind === 'ego') return [ax, ay, bx, by];
    const c = tieControl(ax, ay, bx, by);
    const pts = [ax, ay];
    for (let i = 1; i <= CURVE_SEGMENTS; i++) {
      const t = i / CURVE_SEGMENTS;
      const u = 1 - t;
      pts.push(u * u * ax + 2 * u * t * c.x + t * t * bx, u * u * ay + 2 * u * t * c.y + t * t * by);
    }
    return pts;
  }
  if (kind === 'ego') {
    return Math.abs(by - ay) > Math.abs(bx - ax) ? [ax, ay, ax, by, bx, by] : [ax, ay, bx, ay, bx, by];
  }
  // The two possible corners: (ax, by) and (bx, ay). Use the one farther from the centre.
  return Math.hypot(ax, by) >= Math.hypot(bx, ay) ? [ax, ay, ax, by, bx, by] : [ax, ay, bx, ay, bx, by];
}

/** Distance from p to a flat polyline [x0, y0, x1, y1, ...]. */
export function distToPolyline(px: number, py: number, pts: number[]): number {
  'worklet';
  let best = Infinity;
  for (let i = 2; i + 1 < pts.length; i += 2) {
    best = Math.min(best, distToSegment(px, py, pts[i - 2]!, pts[i - 1]!, pts[i]!, pts[i + 1]!));
  }
  return best;
}

/**
 * The edge nearest to `p` within `tolerance` (graph units), or null, measured
 * along the same route the edge is drawn on. `posOf` resolves endpoint ids.
 */
export function hitTestEdge(
  p: Point,
  edges: { id: string; source: string; target: string; kind: 'ego' | 'tie' }[],
  posOf: (id: string) => Point | undefined,
  tolerance: number,
  routing: EdgeRouting = 'orthogonal',
): string | null {
  let best: string | null = null;
  let bestDist = tolerance;
  for (const e of edges) {
    const a = posOf(e.source);
    const b = posOf(e.target);
    if (!a || !b) continue;
    const d = distToPolyline(p.x, p.y, routeEdge(e.kind, a.x, a.y, b.x, b.y, routing));
    if (d <= bestDist) {
      best = e.id;
      bestDist = d;
    }
  }
  return best;
}
