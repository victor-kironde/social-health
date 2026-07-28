import { DEFAULT_CONFIG, computeScore, type Category, type RelationshipContribution } from '@sg/score-engine';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { scheduleOnRN } from 'react-native-worklets';
import { useStore } from '../data/store';
import { demoNetwork } from '../graph/demo';
import { fitScale, hitTest, screenToGraph } from '../graph/geometry';
import { NODE_RADIUS, layoutEgoGraph, type Point } from '../graph/layout';
import { ToggleChip } from '../ui/components';
import { CATEGORY_LABELS } from '../ui/labels';
import { useTheme } from '../ui/theme';

const RETIRED = new Set(['archived', 'in_memoriam']);
const isBehind = (r: RelationshipContribution) => r.onRhythm !== null && r.onRhythm < 0.5;
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
/** Above this many people, names appear only once zoomed in (labels are the costliest SVG elements). */
const LABEL_LIMIT = 60;
const LABEL_ZOOM = 1.6;

/** Positions from earlier layouts this session, so the picture stays put as people are added. */
const positionCache = new Map<string, Point>();

export default function GraphScreen() {
  const t = useTheme();
  const { log } = useStore();
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const demoSize = demo ? Math.min(500, Math.max(1, Number(demo) || 150)) : null;

  const [categories, setCategories] = useState<Set<Category>>(() => new Set(CATEGORIES));
  const [behindOnly, setBehindOnly] = useState(false);
  const [colourByQuality, setColourByQuality] = useState(true);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [zoomedIn, setZoomedIn] = useState(false);

  const { relationships, names } = useMemo(() => {
    if (demoSize) return demoNetwork(demoSize);
    const rels = computeScore(log, DEFAULT_CONFIG, Date.now()).relationships.filter((r) => !RETIRED.has(r.state));
    return { relationships: rels, names: new Map(log.people.map((p) => [p.id, p.displayName])) };
  }, [log, demoSize]);

  // Lay out everyone, then filter at draw time, so filtering never reshuffles the graph.
  const renderStart = useRef(0);
  const { positions, layoutMs } = useMemo(() => {
    const start = performance.now();
    const positions = layoutEgoGraph(
      relationships.map((r) => ({ id: r.personId, importance: r.importance })),
      { previous: demoSize ? undefined : positionCache },
    );
    if (!demoSize) for (const [id, p] of positions) positionCache.set(id, p);
    const layoutMs = performance.now() - start;
    renderStart.current = performance.now();
    return { positions, layoutMs };
  }, [relationships, demoSize]);

  const [renderMs, setRenderMs] = useState<number | null>(null);
  useEffect(() => {
    if (size) setRenderMs(performance.now() - renderStart.current);
  }, [positions, size]);

  const visible = useMemo(
    () => relationships.filter((r) => categories.has(r.category) && (!behindOnly || isBehind(r))),
    [relationships, categories, behindOnly],
  );
  const showLabels = visible.length <= LABEL_LIMIT || zoomedIn;

  const fit = useMemo(
    () => (size ? fitScale(positions.values(), size, NODE_RADIUS + 24) : 1),
    [positions, size],
  );

  // Pan and pinch run on the UI thread; tap runs on JS to navigate.
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
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
      scheduleOnRN(setZoomedIn, scale.value >= LABEL_ZOOM);
    });
  const tap = Gesture.Tap()
    .maxDuration(300)
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success || !size || demoSize) return;
      const p = screenToGraph(e, size, { tx: tx.value, ty: ty.value, scale: scale.value }, fit);
      const id = hitTest(p, positions, visible.map((r) => r.personId), NODE_RADIUS * 1.4);
      if (id) router.push({ pathname: '/person/[id]', params: { id } });
    });
  const gesture = Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  // Built once per data/filter change; panning and zooming never re-render it.
  const content = useMemo(
    () => (
      <>
        <G>
          {visible.map((r) => {
            const p = positions.get(r.personId)!;
            const stroke = colourByQuality && r.quality !== null ? t.quality[r.quality] : t.edge;
            return (
              <Line
                key={`e-${r.personId}`}
                x1={0}
                y1={0}
                x2={p.x}
                y2={p.y}
                stroke={stroke}
                strokeWidth={0.75 + r.importance * 0.9}
                strokeOpacity={isBehind(r) ? 0.35 : 0.9}
              />
            );
          })}
        </G>
        <G>
          {visible.map((r) => {
            const p = positions.get(r.personId)!;
            const name = names.get(r.personId) ?? '?';
            return (
              <G key={`n-${r.personId}`} opacity={isBehind(r) ? 0.45 : 1}>
                <Circle cx={p.x} cy={p.y} r={NODE_RADIUS} fill={t.card} stroke={t.category[r.category]} strokeWidth={4} />
                <SvgText x={p.x} y={p.y + 5} fontSize={14} fontWeight="600" fill={t.text} textAnchor="middle">
                  {name.charAt(0).toUpperCase()}
                </SvgText>
                {showLabels && (
                  <SvgText x={p.x} y={p.y + NODE_RADIUS + 13} fontSize={10} fill={t.muted} textAnchor="middle">
                    {name.length > 14 ? `${name.slice(0, 13)}…` : name}
                  </SvgText>
                )}
              </G>
            );
          })}
          <Circle cx={0} cy={0} r={NODE_RADIUS + 4} fill={t.accent} />
          <SvgText x={0} y={5} fontSize={13} fontWeight="700" fill={t.onAccent} textAnchor="middle">
            You
          </SvgText>
        </G>
      </>
    ),
    [visible, positions, names, colourByQuality, showLabels, t],
  );

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  if (relationships.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.muted }}>Add people to see your network as a graph.</Text>
      </View>
    );
  }

  const viewBox = size
    ? `${-size.width / 2 / fit} ${-size.height / 2 / fit} ${size.width / fit} ${size.height / fit}`
    : '0 0 1 1';

  return (
    <View style={styles.root}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0 }}
        contentContainerStyle={styles.filters}
      >
        {CATEGORIES.map((c) => (
          <ToggleChip
            key={c}
            label={CATEGORY_LABELS[c]}
            dot={t.category[c]}
            on={categories.has(c)}
            onPress={() =>
              setCategories((prev) => {
                const next = new Set(prev);
                if (next.has(c)) next.delete(c);
                else next.add(c);
                return next;
              })
            }
          />
        ))}
        <ToggleChip label="Behind rhythm only" on={behindOnly} onPress={() => setBehindOnly((v) => !v)} />
        <ToggleChip label="Colour by quality" on={colourByQuality} onPress={() => setColourByQuality((v) => !v)} />
      </ScrollView>

      <GestureDetector gesture={gesture}>
        <View style={styles.canvas} onLayout={onLayout} collapsable={false}>
          {size && (
            <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
              <Svg width={size.width} height={size.height} viewBox={viewBox}>
                {content}
              </Svg>
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      <View style={[styles.legend, { borderTopColor: t.border }]}>
        <Text style={[styles.legendText, { color: t.muted }]}>
          Closer and thicker = more important · faded = behind usual rhythm
          {colourByQuality ? ' · line colour = how the relationship is going' : ''}
        </Text>
        <Text style={[styles.legendText, { color: t.muted }]}>
          {demoSize
            ? `Stress test: ${visible.length} people · layout ${layoutMs.toFixed(0)} ms · first render ${renderMs?.toFixed(0) ?? '…'} ms`
            : `${visible.length} of ${relationships.length} shown · tap someone to open them`}
          {showLabels ? '' : ' · pinch to zoom in for names'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  canvas: { flex: 1, overflow: 'hidden' },
  legend: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  legendText: { fontSize: 12 },
});
