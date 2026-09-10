import { DEFAULT_CONFIG, computeScore } from '@sg/score-engine';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Easing, cancelAnimation, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { relationshipHealth } from '../data/health';
import { hasSeenIntro } from '../data/onboarding';
import { usePrefs } from '../data/prefs';
import { restrictLog } from '../data/subset';
import { SCENARIO_AS_OF, findScenario, scenarioNames } from '../data/scenarioCatalog';
import { useStore } from '../data/store';
import { ORDER_MEANING, TIER_LABELS, TIER_SET_LINK, layoutSignature, nodeRadii, orderTiers, tierLayout } from '../graph/arrange';
import { DEFAULT_DISPLAY, activeFilterCount, applyFilters, type DisplayOptions } from '../graph/display';
import { DisplayPanel } from '../graph/DisplayPanel';
import { PersonStatsCard } from '../graph/PersonStatsCard';
import { personStats } from '../graph/personStats';
import { GraphCanvas } from '../graph/GraphCanvas';
import { demoNetwork } from '../graph/demo';
import { EdgeSheet } from '../graph/EdgeSheet';
import { layoutEgoGraph, type Point } from '../graph/layout';
import { ME_ID, buildGraph, type GraphStyle, type LivePositions } from '../graph/model';
import { useLiveSimulation, type SettleStats } from '../graph/physics/useLiveSimulation';
import { networkMetrics } from '../graph/metrics';
import { deriveTies, tieSignature } from '../graph/ties';
import { DEFAULT_RENDERER, GRAPH_RENDERERS, type RendererId } from '../graph/renderers';
import { Button, ToggleChip } from '../ui/components';
import { CATEGORY_LABELS, IMPORTANCE_LABELS } from '../ui/labels';
import { ScoreRing } from '../ui/ScoreRing';
import { useTheme } from '../ui/theme';
import { useReduceMotion } from '../ui/useReduceMotion';

const RETIRED = new Set(['archived', 'in_memoriam']);
/** `#rrggbb` at reduced opacity, so the graph shows through overlays. */
const translucent = (hex: string, alpha = 0.72) =>
  `${hex}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0')}`;
/** How much further out than their ring people you have lost touch with drift (graph units). */
const LOST_OUTWARD = 90;
/** Rings <-> tiers transition, in ms. */
const ARRANGE_MS = 700;
/** Above this many people, names appear only once zoomed in. */
const LABEL_LIMIT = 60;
const LABEL_ZOOM = 1.6;
/** One full breath of the pulse, in ms. Slow on purpose: calm, not urgent. */
const PULSE_MS = 2800;

export default function GraphScreen() {
  const t = useTheme();
  const { log, graphLayout, saveGraphLayout, photos, status } = useStore();
  const { prefs } = usePrefs();
  const insets = useSafeAreaInsets();
  const { demo, scenario: scenarioId } = useLocalSearchParams<{ demo?: string; scenario?: string }>();
  const demoSize = demo ? Math.min(500, Math.max(1, Number(demo) || 150)) : null;
  // A synthetic scenario from the engine preview, shown as of the scenarios' fixed date.
  const scenario = demoSize ? undefined : findScenario(scenarioId);
  /** Showing made-up data (stress test or scenario): never save, open or log anything real. */
  const sample = demoSize !== null || scenario !== undefined;

  // The first time the app opens, show the introduction once.
  useEffect(() => {
    if (sample || status !== 'ready') return;
    hasSeenIntro()
      .then((seen) => {
        if (!seen) router.push('/intro');
      })
      .catch(() => undefined);
  }, [sample, status]);
  const reducedMotion = useReduceMotion();

  const [display, setDisplay] = useState<DisplayOptions>(DEFAULT_DISPLAY);
  const [panelOpen, setPanelOpen] = useState(false);
  const tiersOn = display.arrange === 'tiers';
  const [zoomedIn, setZoomedIn] = useState(false);
  const [rendererId, setRendererId] = useState<RendererId>(DEFAULT_RENDERER);
  const isLive = GRAPH_RENDERERS[rendererId].live;

  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  // The person whose stats are shown (one tap); a double tap opens their page instead.
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  // Stress test only: switch links off to compare, and report how long the layout took to settle.
  const [demoLinks, setDemoLinks] = useState(true);
  const [settleStats, setSettleStats] = useState<SettleStats | null>(null);

  // People (non-retired), and ties between them inferred from contacts logged with both.
  const { relationships, names, ties, now, total, sourceLog } = useMemo(() => {
    if (demoSize) {
      const d = demoNetwork(demoSize);
      return { ...d, ties: demoLinks ? d.ties : [], now: Date.now(), total: null, sourceLog: null };
    }
    const source = scenario ? scenario.build() : log;
    const now = scenario ? SCENARIO_AS_OF : Date.now();
    const score = computeScore(source, DEFAULT_CONFIG, now);
    const rels = score.relationships.filter((r) => !RETIRED.has(r.state));
    const ties = deriveTies(source.interactions, now, new Set(rels.map((r) => r.personId)));
    return {
      relationships: rels,
      names: scenario ? scenarioNames(source) : new Map(log.people.map((p) => [p.id, p.displayName])),
      ties,
      now,
      total: score.total,
      sourceLog: source,
    };
  }, [log, demoSize, demoLinks, scenario]);
  const byId = useMemo(() => new Map(relationships.map((r) => [r.personId, r])), [relationships]);
  // Network structure over everyone shown on the graph (filters only hide; they do not change it).
  const metrics = useMemo(
    () => networkMetrics(relationships.map((r) => r.personId), ties.map((t) => ({ a: t.a, b: t.b, weight: t.weight }))),
    [relationships, ties],
  );
  const bridges = useMemo(() => [...metrics.nodes.values()].filter((m) => m.groupsTouched >= 2).length, [metrics]);
  // Size from contact frequency; ring (and tiers row) from the chosen order; sector from relationship types.
  const radii = useMemo(() => nodeRadii(relationships, display.sizeByFrequency), [relationships, display.sizeByFrequency]);
  const tiers = useMemo(() => orderTiers(relationships, display.orderBy), [relationships, display.orderBy]);
  const layoutInputs = useMemo(
    () =>
      relationships.map((r) => ({
        id: r.personId,
        importance: tiers.get(r.personId)!,
        radius: radii.get(r.personId)!,
        categories: [r.category, ...r.alsoCategories],
        outward: relationshipHealth(r) === 'lost' ? LOST_OUTWARD : 0,
      })),
    [relationships, tiers, radii],
  );
  const links = useMemo(() => ties.map((t) => ({ source: t.a, target: t.b, weight: t.weight })), [ties]);
  // A remembered layout built without the current ties, rings, sizes or types should relax into them.
  const signature = useMemo(
    () =>
      layoutSignature([
        tieSignature(ties),
        ...layoutInputs.map((n) => `${n.id}:${n.importance}:${n.radius}:${n.outward}:${n.categories.join('+')}`).sort(),
      ]),
    [ties, layoutInputs],
  );
  const previous = sample ? undefined : graphLayout.positions;
  const warm = !sample && graphLayout.tieSignature !== signature;

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
      if (!sample) saveGraphLayout(p, signature);
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
    if (staticPositions && !sample) saveGraphLayout(staticPositions, signature);
  }, [staticPositions, sample, saveGraphLayout, signature]);
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

  const visible = useMemo(() => applyFilters(relationships, display), [relationships, display]);
  // With filters on, the score describes only the people shown (e.g. just family).
  const filtered = activeFilterCount(display) > 0;
  const shownTotal = useMemo(() => {
    if (total === null || !sourceLog || !filtered) return total;
    if (visible.length === 0) return null;
    const ids = new Set(visible.map((r) => r.personId));
    return computeScore(restrictLog(sourceLog, ids), DEFAULT_CONFIG, now).total;
  }, [total, sourceLog, filtered, visible, now]);
  const showLabels = display.names && (visible.length <= LABEL_LIMIT || zoomedIn);

  // Tiers: a list-like arrangement of the people shown, you at the top.
  const tierLabels = display.orderBy === 'importance' ? IMPORTANCE_LABELS : TIER_LABELS[display.orderBy];
  const tierView = useMemo(() => {
    if (!tiersOn) return null;
    const { positions: p, rows } = tierLayout(
      visible.map((r) => ({
        id: r.personId,
        tier: tiers.get(r.personId)!,
        categories: [r.category, ...r.alsoCategories],
        label: names.get(r.personId) ?? '?',
        radius: radii.get(r.personId)!,
      })),
      tierLabels,
    );
    let bottom = 0;
    for (const q of p.values()) bottom = Math.max(bottom, q.y);
    return { positions: p, rows, centre: { x: 0, y: bottom / 2 } };
  }, [tiersOn, visible, tiers, names, radii, tierLabels]);

  // Live renderers draw a blend of the physics positions and the tiers positions, so switching
  // arrangement glides rather than jumps. People not in the tiers (filtered out) stay where they are.
  const mix = useSharedValue(0);
  const tierXY = useSharedValue<number[]>([]);
  useEffect(() => {
    if (!liveSim || !tierView) return;
    tierXY.value = liveSim.live.ids.flatMap((id) => {
      const q = tierView.positions.get(id);
      return q ? [q.x, q.y] : [NaN, NaN];
    });
  }, [liveSim, tierView, tierXY]);
  useEffect(() => {
    const to = tiersOn ? 1 : 0;
    mix.value = reducedMotion ? to : withTiming(to, { duration: ARRANGE_MS, easing: Easing.inOut(Easing.cubic) });
  }, [tiersOn, reducedMotion, mix]);
  const simXY = liveSim?.live.xy;
  const mixedXY = useDerivedValue(() => {
    const a = simXY ? simXY.value : [];
    const k = mix.value;
    const b = tierXY.value;
    if (k === 0 || b.length !== a.length) return a;
    const out = new Array<number>(a.length);
    for (let i = 0; i < a.length; i++) {
      const target = b[i]!;
      out[i] = target !== target ? a[i]! : a[i]! + (target - a[i]!) * k; // NaN: not in the tiers
    }
    return out;
  }, [simXY]);
  const live: LivePositions | undefined = useMemo(
    () => (liveSim ? { ids: liveSim.live.ids, xy: mixedXY } : undefined),
    [liveSim, mixedXY],
  );

  // Time from a new drawing being requested to the renderer committing it.
  const renderStart = useRef(performance.now());
  const [renderMs, setRenderMs] = useState<number | null>(null);
  const graph = useMemo(() => {
    renderStart.current = performance.now();
    return buildGraph(visible, names, ties, metrics.nodes, radii, sample ? undefined : photos);
  }, [visible, names, ties, metrics, radii, photos, sample]);
  // A selection that is filtered out of view simply disappears.
  const selectedEdge = graph.edges.find((e) => e.id === selectedEdgeId) ?? null;
  const selectedPerson =
    selectedPersonId && graph.nodes.some((n) => n.id === selectedPersonId) ? byId.get(selectedPersonId) ?? null : null;
  const stats = useMemo(
    () =>
      selectedPerson
        ? personStats(
            selectedPerson.personId,
            relationships,
            sourceLog?.interactions ?? [],
            sourceLog?.calls,
            metrics.nodes,
            now,
          )
        : null,
    [selectedPerson, relationships, sourceLog, metrics, now],
  );
  const [sheetHeight, setSheetHeight] = useState(0);
  // Bottom edge of the score and stats overlay, so a selected person is kept in sight below it.
  const [overlayBottom, setOverlayBottom] = useState(0);
  // The selected person, or the midpoint of the selected edge, where it is right now,
  // so the view can keep it in sight (above the sheet).
  const focus = useMemo(() => {
    if (!selectedEdge && !selectedPerson) return null;
    const xy = live?.xy.value;
    const index = live ? new Map(live.ids.map((id, i) => [id, i])) : null;
    const at = (id: string): Point | undefined => {
      if (id === ME_ID) return { x: 0, y: 0 };
      if (xy && index) {
        const i = index.get(id);
        return i === undefined ? undefined : { x: xy[2 * i]!, y: xy[2 * i + 1]! };
      }
      return (tierView?.positions ?? positions).get(id);
    };
    if (selectedPerson) return at(selectedPerson.personId) ?? null;
    const a = at(selectedEdge!.source);
    const b = at(selectedEdge!.target);
    return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
    // Recompute only when a different edge or person is selected.
  }, [selectedEdge?.id, selectedPerson?.personId]);
  const onRendered = useCallback(() => setRenderMs(performance.now() - renderStart.current), []);

  const style: GraphStyle = useMemo(
    () => ({
      colours: t,
      showLabels,
      selectedEdgeId: selectedEdge?.id ?? null,
      selectedNodeId: selectedPerson?.personId ?? null,
      colourBy:
        display.colourBy === 'group' && ties.length > 0
          ? ('group' as const)
          : display.colourBy === 'type'
            ? ('category' as const)
            : ('health' as const),
      showSets: display.sets,
      showEgoEdges: display.egoEdges,
      showTies: display.ties,
      rows: tierView?.rows,
      setMaxLink: tierView ? TIER_SET_LINK : undefined,
      categoryNames: CATEGORY_LABELS,
    }),
    [t, display, showLabels, selectedEdge?.id, selectedPerson?.personId, ties.length, tierView],
  );
  const openPerson = (id: string) => router.push({ pathname: '/person/[id]', params: { id } });
  const selectPerson = (id: string) => {
    setSelectedEdgeId(null);
    setSelectedPersonId(id);
  };
  const selectEdge = (id: string) => {
    setSelectedPersonId(null);
    setSelectedEdgeId(id);
  };

  if (!sample && status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (relationships.length === 0) {
    return (
      <View style={[styles.center, { gap: 12 }]}>
        <Text style={[styles.emptyTitle, { color: t.text }]}>Your network starts here</Text>
        <Text style={{ color: t.muted, textAlign: 'center', lineHeight: 20, maxWidth: 360 }}>
          Add the people who matter to you and they will appear around you, coloured by how each relationship is
          doing.
        </Text>
        {!sample && (
          <View style={{ gap: 10, alignSelf: 'stretch', maxWidth: 360, width: '100%', marginTop: 8 }}>
            <Button title="Choose from my contacts" onPress={() => router.push('/import')} />
            <Button title="Add someone myself" variant="secondary" onPress={() => router.push('/person/new')} />
          </View>
        )}
      </View>
    );
  }

  const filters = activeFilterCount(display);
  const settleText = settleStats
    ? ` · settled in ${(settleStats.ms / 1000).toFixed(1)} s (${settleStats.ticks} ticks, ${settleStats.frames} frames)`
    : ' · settling…';
  const timing = isLive
    ? `first frame ${renderMs?.toFixed(0) ?? '…'} ms${settleText} · ${graph.edges.filter((e) => e.kind === 'tie').length} links`
    : `layout ${layoutMs.toFixed(0)} ms · render ${renderMs?.toFixed(0) ?? '…'} ms`;

  return (
    <View style={styles.root}>
      {scenario && <Stack.Screen options={{ title: `Scenario: ${scenario.label}` }} />}
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
        <ToggleChip
          label={`Display & filters${filters ? ` (${filters})` : ''}`}
          on={filters > 0}
          onPress={() => setPanelOpen(true)}
        />
        <ToggleChip label="Rings" on={!tiersOn} onPress={() => setDisplay((d) => ({ ...d, arrange: 'rings' }))} />
        <ToggleChip label="Tiers" on={tiersOn} onPress={() => setDisplay((d) => ({ ...d, arrange: 'tiers' }))} />
        <ToggleChip label="Type areas" on={display.sets} onPress={() => setDisplay((d) => ({ ...d, sets: !d.sets }))} />
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
      </ScrollView>

      <View style={styles.root}>
        <GraphCanvas
          // Remount on renderer change so the timing reflects a cold mount.
          key={rendererId}
          data={graph}
          positions={tierView?.positions ?? positions}
          centre={tierView?.centre}
          renderer={GRAPH_RENDERERS[rendererId].component}
          style={style}
          live={live}
          // People can be dragged around the rings; tiers are a fixed list.
          drag={tiersOn ? undefined : (liveSim ?? undefined)}
          pulse={isLive ? pulse : undefined}
          reduceMotion={reducedMotion}
          onRendered={onRendered}
          onZoomEnd={(s) => setZoomedIn(s >= LABEL_ZOOM)}
          // The whole graph is an overview: close any person or link details that would cover it.
          onHelp={() => router.push('/graph-help')}
          onFrameAll={() => {
            setSelectedEdgeId(null);
            setSelectedPersonId(null);
          }}
          onNodePress={selectPerson}
          onNodeDoublePress={sample ? undefined : openPerson}
          onEdgePress={selectEdge}
          onBackgroundPress={() => {
            setSelectedEdgeId(null);
            setSelectedPersonId(null);
          }}
          focus={focus}
          bottomInset={selectedEdge ? sheetHeight : 0}
          topInset={selectedPerson ? overlayBottom : 0}
        />
        <View
          style={styles.overlay}
          pointerEvents="box-none"
          onLayout={(e) => setOverlayBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
        >
          {shownTotal !== null && prefs.showScore && (
            <Pressable
              onPress={sample ? undefined : () => router.push('/score')}
              accessibilityRole="button"
              accessibilityHint={filtered ? 'Score for the people shown. Opens score details' : 'Opens score details'}
              style={({ pressed }) => [
                styles.score,
                { backgroundColor: translucent(t.card), borderColor: t.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <ScoreRing total={shownTotal} size={46} />
              <Text style={[styles.scoreLabel, { color: t.muted }]}>
                Social{'\n'}Health{filtered ? '\n(filtered)' : ''}
              </Text>
            </Pressable>
          )}
          {selectedPerson && stats && (
            <View style={styles.stats}>
              <PersonStatsCard
                key={selectedPerson.personId}
                rel={selectedPerson}
                name={names.get(selectedPerson.personId) ?? '?'}
                photo={sample ? undefined : photos.get(selectedPerson.personId)}
                stats={stats}
                onOpen={sample ? undefined : () => openPerson(selectedPerson.personId)}
                onLog={
                  sample ? undefined : () => router.push({ pathname: '/log', params: { person: selectedPerson.personId } })
                }
                onClose={() => setSelectedPersonId(null)}
                translucent
              />
            </View>
          )}
        </View>
        {selectedEdge && !sample && (
          <EdgeSheet
            key={selectedEdge.id}
            edge={selectedEdge}
            relationships={byId}
            metrics={metrics.nodes}
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

      <DisplayPanel
        visible={panelOpen}
        options={display}
        onChange={setDisplay}
        onClose={() => setPanelOpen(false)}
        hasTies={ties.length > 0}
      />

      <View style={[styles.legend, { borderTopColor: t.border }]}>
        <Text style={[styles.legendText, { color: t.muted }]}>
          {display.colourBy === 'health' ? 'Green healthy · red unhealthy · grey lost touch · ' : ''}
          {tiersOn ? `higher` : 'closer'} = {ORDER_MEANING[display.orderBy]}
          {display.sizeByFrequency ? ' · bigger = more in touch' : ''}
        </Text>
        <Text style={[styles.legendText, { color: t.muted }]}>
          {demoSize
            ? `Stress test (${GRAPH_RENDERERS[rendererId].label}): ${visible.length} people · ${timing}`
            : scenario
              ? `Synthetic scenario as of ${new Date(now).toISOString().slice(0, 10)} · ${visible.length} people · tap a person for details`
              : `${visible.length} of ${relationships.length} shown · tap ? for the full key`}
          {showLabels ? '' : ' · pinch to zoom in for names'}
        </Text>
        {sample && ties.length > 0 && (
          <Text style={[styles.legendText, { color: t.muted }]}>
            {`Structure: ${metrics.groups} ${metrics.groups === 1 ? 'group' : 'groups'} · ${bridges} ${bridges === 1 ? 'person connects' : 'people connect'} groups (outer ring) · density ${metrics.density.toFixed(2)} · effective size ${metrics.effectiveSize.toFixed(1)} of ${metrics.size}`}
          </Text>
        )}
      </View>
      {!sample && (
        <View style={[styles.actions, { paddingBottom: 12 + insets.bottom }]}>
          <ActionButton label="People" onPress={() => router.push('/people')} />
          <ActionButton label="Catch up" primary onPress={() => router.push('/log')} />
          <ActionButton label="Add person" onPress={() => router.push('/person/new')} />
        </View>
      )}
    </View>
  );
}

/** One of the main screen's actions under the graph. */
function ActionButton({ label, onPress, primary = false }: { label: string; onPress: () => void; primary?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.action,
        primary ? { backgroundColor: t.accent } : { borderColor: t.border, borderWidth: 1 },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={{ color: primary ? t.onAccent : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  filters: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  overlay: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start', gap: 8, maxWidth: 260, width: '62%' },
  score: {
    borderRadius: 30,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: 5,
    paddingRight: 12,
    paddingVertical: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  scoreLabel: { fontSize: 11, lineHeight: 14 },
  stats: { alignSelf: 'stretch' },
  legend: { paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, gap: 2 },
  legendText: { fontSize: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
  action: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
});
