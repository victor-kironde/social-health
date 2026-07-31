import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fitScale, hitTest, hitTestXY, screenToGraph } from './geometry';
import { NODE_RADIUS, type Point } from './layout';
import type { GraphData, GraphRenderer, GraphStyle, LivePositions } from './model';

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
const HIT_RADIUS = NODE_RADIUS * 1.4;

export interface DragHandlers {
  dragStart(id: string, x: number, y: number): void;
  dragMove(id: string, x: number, y: number): void;
  dragEnd(id: string): void;
}

/**
 * Owns everything renderer-independent: measuring the canvas, gestures, the
 * view transform and hit testing. Drawing is delegated to `renderer`.
 *
 * With `live` positions and `drag` handlers, a pan that starts on a node
 * drags that node (in graph coordinates); otherwise it pans the view.
 */
export function GraphCanvas({
  data,
  positions,
  renderer: Renderer,
  style,
  live,
  drag,
  pulse,
  reduceMotion = false,
  onNodePress,
  onZoomEnd,
  onRendered,
}: {
  data: GraphData;
  /** Positions used to fit the view (every node that may be shown, so filtering keeps the fit stable). */
  positions: Map<string, Point>;
  renderer: GraphRenderer;
  style: GraphStyle;
  live?: LivePositions;
  drag?: DragHandlers;
  pulse?: SharedValue<number>;
  /** Snap rather than ease view changes. */
  reduceMotion?: boolean;
  onNodePress?: (id: string) => void;
  onZoomEnd?: (scale: number) => void;
  onRendered?: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const fit = useMemo(() => (size ? fitScale(positions.values(), size, NODE_RADIUS + 24) : 1), [positions, size]);

  // Indices (into live.ids) of the nodes currently drawn, so hidden people cannot be hit.
  const candidates = useMemo(() => {
    if (!live) return [];
    const visible = new Set(data.nodes.map((n) => n.id));
    return live.ids.flatMap((id, i) => (visible.has(id) ? [i] : []));
  }, [live, data]);

  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedScale = useSharedValue(1);
  // Animated fit: set directly the first time, then eased so re-fits (e.g. after
  // the live layout settles wider than it started) never jump.
  const fitValue = useSharedValue(fit);
  const fitted = useRef(false);
  useEffect(() => {
    if (!size) return;
    if (!fitted.current || reduceMotion) {
      fitValue.value = fit;
      fitted.current = true;
    } else {
      fitValue.value = withTiming(fit, { duration: 700, easing: Easing.out(Easing.cubic) });
    }
  }, [fit, size, fitValue, reduceMotion]);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  /** Index of the node being dragged, or -1 while panning the view. */
  const dragging = useSharedValue(-1);
  /** Whether dragStart was sent, so dragEnd is always sent too (even if the gesture is cancelled). */
  const dragStarted = useSharedValue(false);

  const canDrag = !!(live && drag && size);
  const ids = live?.ids ?? [];
  const xy = live?.xy;
  const sz = size ?? { width: 1, height: 1 };

  const pan = Gesture.Pan()
    .minDistance(4)
    .onBegin((e) => {
      dragging.value = -1;
      if (!canDrag || !xy) return;
      const g = screenToGraph({ x: e.x, y: e.y }, sz, { tx: tx.value, ty: ty.value, scale: scale.value }, fitValue.value);
      dragging.value = hitTestXY(g.x, g.y, xy.value, candidates, HIT_RADIUS);
    })
    .onStart((e) => {
      if (dragging.value < 0 || !drag) return;
      const g = screenToGraph({ x: e.x, y: e.y }, sz, { tx: tx.value, ty: ty.value, scale: scale.value }, fitValue.value);
      dragStarted.value = true;
      scheduleOnRN(drag.dragStart, ids[dragging.value]!, g.x, g.y);
    })
    .onUpdate((e) => {
      if (dragging.value >= 0 && drag) {
        const g = screenToGraph({ x: e.x, y: e.y }, sz, { tx: tx.value, ty: ty.value, scale: scale.value }, fitValue.value);
        scheduleOnRN(drag.dragMove, ids[dragging.value]!, g.x, g.y);
        return;
      }
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      if (dragging.value >= 0) return;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    })
    .onFinalize(() => {
      // Runs after end, cancellation, or a touch that never became a pan.
      if (dragStarted.value && drag) scheduleOnRN(drag.dragEnd, ids[dragging.value]!);
      dragStarted.value = false;
      dragging.value = -1;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (onZoomEnd) scheduleOnRN(onZoomEnd, scale.value);
    });

  const tap = Gesture.Tap()
    .maxDuration(300)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success || !size || !onNodePress) return;
      const p = screenToGraph(e, size, { tx: tx.value, ty: ty.value, scale: scale.value }, fitValue.value);
      const id = live
        ? live.ids[hitTestXY(p.x, p.y, live.xy.value, candidates, HIT_RADIUS)]
        : hitTest(p, positions, data.nodes.map((n) => n.id), HIT_RADIUS);
      if (id) onNodePress(id);
    });

  const gesture = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  return (
    <GestureDetector gesture={gesture}>
      <View style={styles.canvas} onLayout={onLayout} collapsable={false}>
        {size && (
          <Renderer
            data={data}
            positions={positions}
            size={size}
            fit={fit}
            view={{ tx, ty, scale, fit: fitValue }}
            style={style}
            live={live}
            pulse={pulse}
            onRendered={onRendered}
          />
        )}
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, overflow: 'hidden' },
});
