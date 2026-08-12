import { DEFAULT_CONFIG, computeScore, type Category } from '@sg/score-engine';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Easing, cancelAnimation, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useStore } from '../data/store';
import { GraphCanvas } from '../graph/GraphCanvas';
import { demoNetwork } from '../graph/demo';
import { EdgeSheet } from '../graph/EdgeSheet';
import { layoutEgoGraph, type Point } from '../graph/layout';
import { ME_ID, buildGraph, type GraphStyle } from '../graph/model';
import { useLiveSimulation, type SettleStats } from '../graph/physics/useLiveSimulation';
import { deriveTies, tieSignature } from '../graph/ties';
import { DEFAULT_RENDERER, GRAPH_RENDERERS, type RendererId } from '../graph/renderers';
import { ToggleChip } from '../ui/components';
import { CATEGORY_LABELS } from '../ui/labels';
import { useTheme } from '../ui/theme';
import { useReduceMotion } from '../ui/useReduceMotion';

const RETIRED = new Set(['archived', 'in_memoriam']);
const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
/** Above this many people, names appear only once zoomed in. */
const LABEL_LIMIT = 60;
const LABEL_ZOOM = 1.6;
/** One full breath of the pulse, in ms. Slow on purpose: calm, not urgent. */
const PULSE_MS = 2800;

export default function GraphScreen() {
  const t = useTheme();
  const { log, graphLayout, saveGraphLayout } = useStore();
  const { demo } = useLocalSearchParams<{ demo?: string }>();
  const demoSize = demo ? Math.min(500, Math.max(1, Number(demo) || 150)) : null;
  const reducedMotion = useReduceMotion();

  const [categories, setCategories] = useState<Set<Category>>(() => new Set(CATEGORIES));
  const [behindOnly, setBehindOnly] = useState(false);
  const [colourByQuality, setColourByQuality] = useState(true);
  const [zoomedIn, setZoomedIn] = useState(false);
  const [rendererId, setRendererId] = useState<RendererId>(DEFAULT_RENDERER);
  const isLive = GRAPH_RENDERERS[rendererId].live;

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // Stress test only: switch links off to compare, and report how long the layout took to settle.
  const [demoLinks, setDemoLinks] = useState(true);
  const [settleStats, setSettleStats] = useState<SettleStats | null>(null);

  // People (non-retired), and ties between them inferred from contacts logged with both.
  const { relationships, names, ties, now } = useMemo(() => {
    const now = Date.now();
    if (demoSize) {
      const d = demoNetwork(demoSize);
      return { ...d, ties: demoLinks ? d.ties : [], now };
    }
    const rels = computeScore(log, DEFAULT_CONFIG, now).relationships.filter((r) => !RETIRED.has(r.state));
    const ties = deriveTies(log.interactions, now, new Set(rels.map((r) => r.personId)));
    return { relationships: rels, names: new Map(log.people.map((p) => [p.id, p.displayName])), ties, now };
  }, [log, demoSize, demoLinks]);
  const byId = useMemo(() => new Map(relationships.map((r) => [r.personId, r])), [relationships]);
  const layoutInputs = useMemo(
    () => relationships.map((r) => ({ id: r.personId, importance: r.importance })),
    [relationships],
  );
  const links = useMemo(() => ties.map((t) => ({ source: t.a, target: t.b, weight: t.weight })), [ties]);
  // A remembered layout built without the current ties should relax into them.
  const signature = useMemo(() => tieSignature(ties), [ties]);
  const previous = demoSize ? undefined : graphLayout.positions;
  const warm = !demoSize && graphLayout.tieSignature !== signature;

  // Live renderers: a running simulation (lays everyone out, then filtering only hides people).
  // Once it settles, the view re-fits to where people actually ended up.
  const [settled, setSettled] = useState<Map<string, Point> | null>(null);
  const liveSim = useLiveSimulation(layoutInputs, {
    enabled: isLive,
    previous,
    links,
    warm,
    reducedMotion,
    onSettled: (p, stats) => {
      if (!demoSize) saveGraphLayout(p, signature);
      setSettled(p);
      if (stats) setSettleStats(stats);
    },
  });

  // Static renderers: a one-shot layout.
  const { staticPositions, layoutMs } = useMemo(() => {
    if (isLive) return { staticPositions: null, layoutMs: 0 };
    const start = performance.now();
    const p = layoutEgoGraph(layoutInputs, { previous, links, warm });
    return { staticPositions: p, layoutMs: performance.now() - start };
    // `warm` and `previous` are read once per layout; a new layout comes from new people or ties.
  }, [isLive, layoutInputs, links]);
  useEffect(() => {
    if (staticPositions && !demoSize) saveGraphLayout(staticPositions, signature);
  }, [staticPositions, demoSize, saveGraphLayout, signature]);
  // Only trust settled positions that belong to the current set of people.
  const settledMatches =
    settled !== null && settled.size === layoutInputs.length && layoutInputs.every((n) => settled.has(n.id));
  const positions = (settledMatches ? settled : liveSim?.initial) ?? staticPositions ?? new Map<string, Point>();

  // A slow, looping phase for the pulse; only while this screen is focused and motion is allowed.
  const pulse = useSharedValue(0);
  useFocusEffect(
    useCallback(() => {
      if (isLive && !reducedMotion) {
        pulse.value = 0;
        pulse.value = withRepeat(withTiming(1, { duration: PULSE_MS, easing: Easing.linear }), -1, false);
      }
      return () => cancelAnimation(pulse);
    }, [isLive, reducedMotion, pulse]),
  );

  const visible = useMemo(
    () =>
      relationships.filter(
        (r) => categories.has(r.category) && (!behindOnly || (r.onRhythm !== null && r.onRhythm < 0.5)),
      ),
    [relationships, categories, behindOnly],
  );
  const showLabels = visible.length <= LABEL_LIMIT || zoomedIn;

  // Time from a new drawing being requested to the renderer committing it.
  const renderStart = useRef(performance.now());
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const graph = useMemo(() => {
    renderStart.current = performance.now();
    return buildGraph(visible, names, ties);
  }, [visible, names, ties]);
  // A selection that is filtered out of view simply disappears.
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId) ?? null;
  const [sheetHeight, setSheetHeight] = useState(0);
  // Midpoint of the selected edge, where it is right now, so the view can keep it above the sheet.
  const focus = useMemo(() => {
    if (!selectedEdge) return null;
    const xy = liveSim?.live.xy.value;
    const index = liveSim ? new Map(liveSim.live.ids.map((id, i) => [id, i])) : null;
    const at = (id: string): Point | undefined => {
      if (id === ME_ID) return { x: 0, y: 0 };
      if (xy && index) {
        const i = index.get(id);
        return i === undefined ? undefined : { x: xy[2 * i]!, y: xy[2 * i + 1]! };
      }
      return positions.get(id);
    };
    const a = at(selectedEdge.source);
    const b = at(selectedEdge.target);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
    // Recompute only when a different edge is selected.
  }, [selectedEdge?.id]);
  const onRendered = useCallback(() => setRenderMs(performance.now() - renderStart.current), []);

  const style: GraphStyle = useMemo(
    () => ({ colours: t, colourByQuality, showLabels, selectedEdgeId: selectedEdge?.id ?? null }),
    [t, colourByQuality, showLabels, selectedEdge?.id],
  );
  const openPerson = (id: string) => router.push({ pathname: '/person/[id]', params: { id } });

  if (relationships.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.muted }}>Add people to see your network as a graph.</Text>
      </View>
    );
  }

  const toggleCategory = (c: Category) =>
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const settleText = settleStats
    ? ` · settled in ${(settleStats.ms / 1000).toFixed(1)} s (${settleStats.ticks} ticks, ${settleStats.frames} frames)`
    : ' · settling…';
  const timing = isLive
    ? `first frame ${renderMs?.toFixed(0) ?? '…'} ms${settleText} · ${graph.edges.filter((e) => e.kind === 'tie').length} links`
    : `layout ${layoutMs.toFixed(0)} ms · render ${renderMs?.toFixed(0) ?? '…'} ms`;

  return (
    <View style={styles.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.filters}>
        {demoSize &&
          (Object.keys(GRAPH_RENDERERS) as RendererId[]).map((id) => (
            <ToggleChip
              key={id}
              label={GRAPH_RENDERERS[id].label}
              on={rendererId === id}
              onPress={() => {
                renderStart.current = performance.now();
                setRenderMs(null);
                setRendererId(id);
              }}
            />
          ))}
        {CATEGORIES.map((c) => (
          <ToggleChip
            key={c}
            label={CATEGORY_LABELS[c]}
            dot={t.category[c]}
            on={categories.has(c)}
            onPress={() => toggleCategory(c)}
          />
        ))}
        {demoSize && (
          <ToggleChip
            label="Links"
            on={demoLinks}
            onPress={() => {
              setSettleStats(null);
              setDemoLinks((v) => !v);
            }}
          />
        )}
        <ToggleChip label="Behind rhythm only" on={behindOnly} onPress={() => setBehindOnly((v) => !v)} />
        <ToggleChip label="Colour by quality" on={colourByQuality} onPress={() => setColourByQuality((v) => !v)} />
      </ScrollView>

      <View style={styles.root}>
        <GraphCanvas
          // Remount on renderer change so the timing reflects a cold mount.
          key={rendererId}
          data={graph}
          positions={positions}
          renderer={GRAPH_RENDERERS[rendererId].component}
          style={style}
          live={liveSim?.live}
          drag={liveSim ?? undefined}
          pulse={isLive ? pulse : undefined}
          reduceMotion={reducedMotion}
          onRendered={onRendered}
          onZoomEnd={(s) => setZoomedIn(s >= LABEL_ZOOM)}
          onNodePress={demoSize ? undefined : openPerson}
          onEdgePress={setSelectedEdgeId}
          onBackgroundPress={() => setSelectedEdgeId(null)}
          focus={focus}
          bottomInset={selectedEdge ? sheetHeight : 0}
        />
        {selectedEdge && !demoSize && (
          <EdgeSheet
            key={selectedEdge.id}
            edge={selectedEdge}
            relationships={byId}
            names={names}
            now={now}
            animate={!reducedMotion}
            onClose={() => setSelectedEdgeId(null)}
            onOpenPerson={openPerson}
            onLogContact={(ids) => router.push({ pathname: '/log', params: { people: ids.join(',') } })}
            onHeight={setSheetHeight}
          />
        )}
      </View>

      <View style={[styles.legend, { borderTopColor: t.border }]}>
        <Text style={[styles.legendText, { color: t.muted }]}>
          Closer and thicker = more important · faded = behind usual rhythm
          {isLive ? ' · glowing = in touch this week' : ''}
          {graph.edges.some((e) => e.kind === 'tie') ? ' · thin grey lines = seen together' : ''}
          {colourByQuality ? ' · line colour = how the relationship is going' : ''}
        </Text>
        <Text style={[styles.legendText, { color: t.muted }]}>
          {demoSize
            ? `Stress test (${GRAPH_RENDERERS[rendererId].label}): ${visible.length} people · ${timing}`
            : `${visible.length} of ${relationships.length} shown · tap a person to open, a line for details${isLive ? ' · drag to move' : ''}`}
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
  legend: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  legendText: { fontSize: 12 },
});
