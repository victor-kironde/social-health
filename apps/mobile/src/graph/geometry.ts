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
  const cx = size.width / 2;
  const cy = size.height / 2;
  return {
    x: (screen.x - cx - view.tx) / view.scale / fit,
    y: (screen.y - cy - view.ty) / view.scale / fit,
  };
}

/** The id of the nearest node within `radius` of `p`, or null. */
export function hitTest(p: Point, positions: Map<string, Point>, ids: Iterable<string>, radius: number): string | null {
  let best: string | null = null;
  let bestDist = radius;
  for (const id of ids) {
    const q = positions.get(id);
    if (!q) continue;
    const d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= bestDist) {
      best = id;
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
