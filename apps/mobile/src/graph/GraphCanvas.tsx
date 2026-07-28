import { useMemo, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { fitScale, hitTest, screenToGraph } from './geometry';
import { NODE_RADIUS, type Point } from './layout';
import type { GraphData, GraphRenderer, GraphStyle } from './model';

const MIN_SCALE = 0.4;
const MAX_SCALE = 4;

/**
 * Owns everything renderer-independent: measuring the canvas, pan/pinch/tap
 * gestures, the view transform and hit testing. Drawing is delegated to
 * whichever `renderer` is passed in.
 */
export function GraphCanvas({
  data,
  positions,
  renderer: Renderer,
  style,
  onNodePress,
  onZoomEnd,
  onRendered,
}: {
  data: GraphData;
  /** Positions for every node that may be shown (not only the visible ones), so the fit is stable under filtering. */
  positions: Map<string, Point>;
  renderer: GraphRenderer;
  style: GraphStyle;
  onNodePress?: (id: string) => void;
  onZoomEnd?: (scale: number) => void;
  onRendered?: () => void;
}) {
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const fit = useMemo(() => (size ? fitScale(positions.values(), size, NODE_RADIUS + 24) : 1), [positions, size]);

  // Pan and pinch run on the UI thread; tap runs on JS to hit-test and navigate.
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const pan = Gesture.Pan()
    .minDistance(4)
    .onUpdate((e) => {
      tx.value = savedTx.value + e.translationX;
      ty.value = savedTy.value + e.translationY;
    })
    .onEnd(() => {
      savedTx.value = tx.value;
      savedTy.value = ty.value;
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
      const p = screenToGraph(e, size, { tx: tx.value, ty: ty.value, scale: scale.value }, fit);
      const id = hitTest(p, positions, data.nodes.map((n) => n.id), NODE_RADIUS * 1.4);
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
            view={{ tx, ty, scale }}
            style={style}
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
