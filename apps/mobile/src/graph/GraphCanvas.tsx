import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fitScale, hitTest, hitTestXY, screenToGraph, zoomAbout } from './geometry';
import { NODE_RADIUS, type Point } from './layout';
import { FocusIcon, HelpIcon, ResetIcon } from './icons';
import { type GraphData, type GraphRenderer, type GraphStyle, type LivePositions } from './model';

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
/** Taps count a little outside a node, more so for small ones (minimum comfortable target). */
const hitRadius = (r: number) => Math.max(r * 1.4, NODE_RADIUS * 1.2);
/** Floating buttons (focus, help): size and spacing. */
const FAB_SIZE = 44;
const FAB_GAP = 12;
/** Space kept around the outermost people (graph units): their size, type area and its name. */
const FIT_MARGIN = NODE_RADIUS + 50;

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
  onNodeDoublePress,
  onBackgroundPress,
  onZoomEnd,
  onFrameAll,
  onHelp,
  onReset,
  onMePress,
  leftActions = [],
  onRendered,
  focus,
  bottomInset = 0,
  topInset = 0,
  centre,
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
  /** A double tap on a person. When set, single taps wait briefly to rule out a second tap. */
  onNodeDoublePress?: (id: string) => void;
  onBackgroundPress?: () => void;
  onZoomEnd?: (scale: number) => void;
  /** The view went back to the whole graph (focus button or double tap on empty space). */
  onFrameAll?: () => void;
  /** Shows a "?" button above the focus button. */
  onHelp?: () => void;
  /** Shows a reset button above the "?" (puts moved people back). */
  onReset?: () => void;
  /** A tap on you, at the centre. */
  onMePress?: () => void;
  /** Round icon buttons stacked in the bottom-left corner, first at the bottom. */
  leftActions?: { key: string; label: string; Icon: ComponentType<{ colour: string }>; onPress: () => void }[];
  onRendered?: () => void;
  /** A graph point to keep in view, e.g. the selected edge; the view pans to it if hidden. */
  focus?: Point | null;
  /** Height covered at the bottom (e.g. by a sheet), in pixels. */
  bottomInset?: number;
  /** Height covered at the top (e.g. by a stats card), in pixels; the focus is kept below it. */
  topInset?: number;
  /** Graph point to centre the view on (default: you, at the origin); the view eases there when it changes. */
  centre?: Point;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const cx = centre?.x ?? 0;
  const cy = centre?.y ?? 0;
  const fit = useMemo(() => {
    if (!size) return 1;
    const around = [{ x: -cx, y: -cy }, ...[...positions.values()].map((p) => ({ x: p.x - cx, y: p.y - cy }))];
    return fitScale(around, size, FIT_MARGIN);
  }, [positions, size, cx, cy]);

  // Indices (into live.ids) of the nodes currently drawn, so hidden people cannot be hit, and their hit radii.
  const { candidates, radii, radiusOf } = useMemo(() => {
    const r = new Map(data.nodes.map((n) => [n.id, hitRadius(n.radius)]));
    const radiusOf = (id: string) => r.get(id) ?? hitRadius(NODE_RADIUS);
    if (!live) return { candidates: [] as number[], radii: [] as number[], radiusOf };
    const candidates = live.ids.flatMap((id, i) => (r.has(id) ? [i] : []));
    return { candidates, radii: candidates.map((i) => r.get(live.ids[i]!)!), radiusOf };
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

  // Zoom state at the start of a pinch: scale, translation and the point between the fingers.
  const pinchStart = useSharedValue({ scale: 1, tx: 0, ty: 0, fx: 0, fy: 0 });
  /** True while two fingers are pinching; the one-finger pan then leaves the view alone. */
  const pinching = useSharedValue(false);
  /** Set when a pinch starts during a pan, so the pan re-bases on the view the pinch leaves behind. */
  const panRebase = useSharedValue(false);

  // One finger: drag a person, or pan the view. Two fingers belong to the pinch, which zooms and
  // pans together. maxPointers only stops a pan from *starting* with two fingers: a pan that began
  // with one finger stays active when a second lands, so it must also stand aside mid-pinch.
  const pan = Gesture.Pan()
    .minDistance(4)
    .maxPointers(1)
    .onBegin((e) => {
      dragging.value = -1;
      if (!canDrag || !xy) return;
      const g = screenToGraph({ x: e.x, y: e.y }, sz, { tx: tx.value, ty: ty.value, scale: scale.value }, fitValue.value);
      dragging.value = hitTestXY(g.x, g.y, xy.value, candidates, 0, radii);
    })
    .onStart((e) => {
      if (dragging.value < 0 || !drag) {
        // Pan from wherever the view is now (a pinch or animation may have moved it).
        savedTx.value = tx.value;
        savedTy.value = ty.value;
        return;
      }
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
      if (pinching.value) {
        panRebase.value = true;
        return;
      }
      if (panRebase.value) {
        // Continue from where the pinch left the view, not from where this pan started.
        savedTx.value = tx.value - e.translationX;
        savedTy.value = ty.value - e.translationY;
        panRebase.value = false;
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
      panRebase.value = false;
      // Runs after end, cancellation, or a touch that never became a pan.
      if (dragStarted.value && drag) scheduleOnRN(drag.dragEnd, ids[dragging.value]!);
      dragStarted.value = false;
      dragging.value = -1;
    });

  // Zoom about the point between the fingers (it stays under them), and follow it as they move.
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      pinching.value = true;
      // A pan that began before this pinch must not replay its finger's whole movement afterwards.
      panRebase.value = true;
      pinchStart.value = { scale: scale.value, tx: tx.value, ty: ty.value, fx: e.focalX, fy: e.focalY };
    })
    .onUpdate((e) => {
      // As a finger lifts, the last update's focal point is the remaining finger alone; following
      // it would jump the view by half the distance between the fingers.
      if (e.numberOfPointers < 2) return;
      const start = pinchStart.value;
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * e.scale));
      const t = zoomAbout(start, { x: start.fx, y: start.fy }, { x: e.focalX, y: e.focalY }, next, sz);
      scale.value = next;
      tx.value = t.tx;
      ty.value = t.ty;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      savedTx.value = tx.value;
      savedTy.value = ty.value;
      if (onZoomEnd) scheduleOnRN(onZoomEnd, scale.value);
    })
    .onFinalize(() => {
      pinching.value = false;
    });

  // Pan just enough to bring `focus` into the part of the canvas not covered by the inset.
  useEffect(() => {
    if (!focus || !size) return;
    const k = scale.value * fitValue.value;
    const margin = 32;
    const top = topInset + margin;
    const bottom = size.height - bottomInset - margin;
    const sy = size.height / 2 + ty.value + k * focus.y;
    const sx = size.width / 2 + tx.value + k * focus.x;
    let dy = 0;
    if (sy > bottom) dy = (top + bottom) / 2 - sy;
    else if (sy < top) dy = top - sy;
    let dx = 0;
    if (sx < margin) dx = margin - sx;
    else if (sx > size.width - margin) dx = size.width - margin - sx;
    if (dx === 0 && dy === 0) return;
    const nextTx = tx.value + dx;
    const nextTy = ty.value + dy;
    savedTx.value = nextTx;
    savedTy.value = nextTy;
    const timing = { duration: reduceMotion ? 0 : 350, easing: Easing.out(Easing.cubic) };
    tx.value = withTiming(nextTx, timing);
    ty.value = withTiming(nextTy, timing);
    // Only when the focus or the covered area changes, not on every pan.
  }, [focus?.x, focus?.y, bottomInset, topInset, size]);

  // A new centre (e.g. switching to tiers, which hang below you) re-centres the view, dropping any pan.
  const lastCentre = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (!size || (lastCentre.current.x === cx && lastCentre.current.y === cy)) return;
    lastCentre.current = { x: cx, y: cy };
    const k = scale.value * fit;
    // Locals, not savedTx.value: a shared value read straight after a JS write can be stale.
    const nextTx = -k * cx;
    const nextTy = -k * cy;
    savedTx.value = nextTx;
    savedTy.value = nextTy;
    const timing = { duration: reduceMotion ? 0 : 700, easing: Easing.out(Easing.cubic) };
    tx.value = withTiming(nextTx, timing);
    ty.value = withTiming(nextTy, timing);
  }, [cx, cy, fit, size]);

  /** The person under a screen point, if any. */
  const nodeAt = (e: { x: number; y: number }) => {
    if (!size) return null;
    const p = screenToGraph(e, size, { tx: tx.value, ty: ty.value, scale: scale.value }, fitValue.value);
    const id = live
      ? live.ids[hitTestXY(p.x, p.y, live.xy.value, candidates, 0, radii)]
      : hitTest(p, positions, data.nodes.map((n) => n.id), radiusOf);
    return { p, id: id ?? null };
  };

  // A tap on a person selects them; anywhere else (lines included) clears the selection.
  const tap = Gesture.Tap()
    .maxDuration(300)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success || !size) return;
      const hit = nodeAt(e);
      if (hit?.id) onNodePress?.(hit.id);
      else if (hit && onMePress && Math.abs(hit.p.x) + Math.abs(hit.p.y) <= NODE_RADIUS + 14) onMePress();
      else onBackgroundPress?.();
    });

  /** Back to the whole graph: no zoom, centred, everyone in view. */
  const frameAll = () => {
    if (!size) return;
    const nextTx = -fit * cx;
    const nextTy = -fit * cy;
    savedScale.value = 1;
    savedTx.value = nextTx;
    savedTy.value = nextTy;
    const timing = { duration: reduceMotion ? 0 : 450, easing: Easing.out(Easing.cubic) };
    scale.value = withTiming(1, timing);
    tx.value = withTiming(nextTx, timing);
    ty.value = withTiming(nextTy, timing);
    onZoomEnd?.(1);
    onFrameAll?.();
  };

  // Double tap: on a person opens them; on empty space frames the whole graph.
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      const id = nodeAt(e)?.id;
      if (id) onNodeDoublePress?.(id);
      else frameAll();
    });

  const taps = Gesture.Exclusive(doubleTap, tap);
  const gesture = Gesture.Race(taps, Gesture.Simultaneous(pan, pinch));

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };

  const c = style.colours;
  return (
    <View style={styles.canvas}>
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
      {onHelp && (
        <Fab bottom={bottomInset + 16 + FAB_SIZE + FAB_GAP} side="right" label="What the graph shows" onPress={onHelp} colours={c}>
          <HelpIcon colour={c.text} />
        </Fab>
      )}
      {onReset && (
        <Fab bottom={bottomInset + 16 + 2 * (FAB_SIZE + FAB_GAP)} side="right" label="Put moved people back" onPress={onReset} colours={c}>
          <ResetIcon colour={c.text} />
        </Fab>
      )}
      <Fab bottom={bottomInset + 16} side="right" label="Fit the whole graph" onPress={frameAll} colours={c}>
        <FocusIcon colour={c.text} />
      </Fab>
      {leftActions.map((a, i) => (
        <Fab key={a.key} bottom={bottomInset + 16 + i * (FAB_SIZE + FAB_GAP)} side="left" label={a.label} onPress={a.onPress} colours={c}>
          <a.Icon colour={c.text} />
        </Fab>
      ))}
    </View>
  );
}

/** A small round outlined button floating over the graph. */
function Fab({
  bottom,
  side,
  label,
  onPress,
  colours,
  children,
}: {
  bottom: number;
  side: 'left' | 'right';
  label: string;
  onPress: () => void;
  colours: { card: string; edge: string };
  children: ReactNode;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [
        styles.fab,
        { bottom, [side]: 16, backgroundColor: colours.card, borderColor: colours.edge, opacity: pressed ? 0.7 : 0.92 },
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  canvas: { flex: 1, overflow: 'hidden' },
  fab: {
    position: 'absolute',
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
});
