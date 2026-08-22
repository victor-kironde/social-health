import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSharedValue } from 'react-native-reanimated';
import type { DragHandlers } from '../GraphCanvas';
import type { LayoutInput, LayoutLink, PlacedPoint, Point } from '../layout';
import type { LivePositions } from '../model';
import { LiveSimulation } from './LiveSimulation';

export interface SettleStats {
  /** Animation frames the loop ran, and simulation ticks taken, until rest. */
  frames: number;
  ticks: number;
  ms: number;
}

export interface LiveControls extends DragHandlers {
  live: LivePositions;
  /** Positions at the start, for fitting the view before anything moves. */
  initial: Map<string, Point>;
}

/**
 * Runs a LiveSimulation one tick per animation frame on the JS thread while
 * it is moving, publishing positions to a shared value that renderers draw
 * on the UI thread. The loop stops once settled and restarts on drag.
 * With `reducedMotion`, it settles immediately instead of animating.
 * Returns null when `enabled` is false (static renderers).
 */
export function useLiveSimulation(
  nodes: LayoutInput[],
  opts: {
    enabled: boolean;
    previous?: Map<string, PlacedPoint>;
    links?: LayoutLink[];
    /** Relax a fully remembered layout (its ties changed since it was saved). */
    warm?: boolean;
    reducedMotion: boolean;
    onSettled?: (p: Map<string, PlacedPoint>, stats?: SettleStats) => void;
  },
): LiveControls | null {
  const { enabled, previous, links, warm, reducedMotion } = opts;
  const settledRef = useRef(opts.onSettled);
  settledRef.current = opts.onSettled;

  // A new simulation only when the people, their sizes, types or ties change, not on every render.
  const key =
    nodes.map((n) => `${n.id}:${n.importance}:${n.radius ?? ''}:${(n.categories ?? []).join('+')}`).join('|') +
    '#' +
    (links ?? []).map((l) => `${l.source}-${l.target}`).join('|');
  const sim = useMemo(() => {
    if (!enabled) return null;
    const s = new LiveSimulation(nodes, { previous, links, warm });
    if (reducedMotion) s.settle();
    return s;
  }, [key, enabled, reducedMotion]);

  const xy = useSharedValue<number[]>([]);
  const frame = useRef<number | null>(null);

  const run = useCallback(() => {
    if (!sim || frame.current !== null) return;
    const start = performance.now();
    const startTicks = sim.ticks;
    let frames = 0;
    const tick = () => {
      if (sim.active) {
        sim.step();
        xy.value = sim.xy();
        frames++;
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = null;
        settledRef.current?.(sim.positions(), { frames, ticks: sim.ticks - startTicks, ms: performance.now() - start });
      }
    };
    frame.current = requestAnimationFrame(tick);
  }, [sim, xy]);

  useEffect(() => {
    if (!sim) return;
    xy.value = sim.xy();
    if (sim.active) run();
    else settledRef.current?.(sim.positions());
    return () => {
      // Leaving mid-motion (or mid-drag): settle and report, so the result is still saved.
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
        settledRef.current?.(sim.flush());
      }
    };
  }, [sim, xy, run]);

  return useMemo(() => {
    if (!sim) return null;
    return {
      live: { ids: sim.ids, xy },
      initial: sim.positions(),
      dragStart: (id: string, x: number, y: number) => {
        sim.dragStart(id, x, y);
        run();
      },
      dragMove: (id: string, x: number, y: number) => sim.dragMove(id, x, y),
      dragEnd: (id: string) => sim.dragEnd(id),
    };
  }, [sim, xy, run]);
}
