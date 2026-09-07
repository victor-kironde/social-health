import { Canvas, Group, Picture, PointMode, StrokeCap, type SkPaint } from '@shopify/react-native-skia';
import type { Category } from '@sg/score-engine';
import { spanningEdges } from '../arrange';
import { routeEdge } from '../geometry';
import { useEffect, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { NODE_RADIUS, SECTOR_ORDER } from '../layout';
import { ME_ID, edgeStroke, encode, type GraphRendererProps } from '../model';
import { SkiaRenderer } from './SkiaRenderer';
import { GRAPH_UNSHIFT, centreOffset, drawPhoto, graphPicture, glowPaint, makeFonts, paint, photoImage, photoSpec, type PhotoSpec } from './skiaKit';

/** Everything needed to draw one node, prepared on JS so the per-frame worklet only reads it. */
interface NodeSpec {
  i: number;
  r: number;
  /** Their photo, drawn instead of the initial. */
  photo: PhotoSpec | null;
  fill: SkPaint;
  ring: SkPaint;
  text: SkPaint;
  initial: string;
  initialDx: number;
  label: string;
  labelDx: number;
  labelPaint: SkPaint;
  glow: SkPaint | null;
  /** Extra outer ring for people whose ties reach another group. */
  bridgeRing: SkPaint | null;
  /** Per-node phase offset so pulses are not in lockstep. */
  phase: number;
}

interface EdgeSpec {
  s: number; // -1 = the user at the origin
  t: number;
  paint: SkPaint;
}

/** Ties sharing a stroke, drawn as one path per frame (one draw call, no per-tie allocation). */
interface TieGroup {
  paint: SkPaint;
  /** Flattened endpoint indices [s0, t0, s1, t1, ...]. */
  ends: number[];
}

/** One relationship type's background area: its members' discs joined along a spanning tree. */
interface SetSpec {
  /** Draws the whole set at once with this opacity, so the set's own overlaps do not darken. */
  layer: SkPaint;
  fill: SkPaint;
  bar: SkPaint;
  label: SkPaint;
  /** Outline behind the name so it stays readable over people and lines. */
  halo: SkPaint;
  name: string;
  nameDx: number;
  /** Member indices into xy, their radii, and whether this is their main type (parallel). */
  members: number[];
  radii: number[];
  primary: boolean[];
}

const TAU = Math.PI * 2;
/** Distance of the bridge ring outside the node. */
const BRIDGE_GAP = 6;
/** Halo radius relative to the node. */
const GLOW_SCALE = 1.75;
/** How far a set reaches beyond its members' circles. */
const SET_PAD = 14;
/** Width of the band joining members of a set. */
const SET_BAR = 30;
/** Members further apart than this are drawn as separate islands (unless the style says otherwise). */
const SET_MAX_LINK = 260;
/** Opacity of each set: low, so two overlapping sets read as a third, darker shade. */
const SET_ALPHA = 0.22;
/** Gap between a set's outermost member and its name. */
const SET_LABEL_GAP = 10;
/** Line height when several set names stack on one person. */
const SET_LABEL_LINE = 14;

/**
 * Live Skia renderer: draws from per-frame positions published by the live
 * simulation. Three layers are recorded on the UI thread: edges and nodes
 * (re-recorded only when positions change) and a glow layer for people in
 * recent contact, which breathes with the `pulse` phase. Falls back to the
 * static SkiaRenderer when no live positions are supplied.
 */
export function LiveSkiaRenderer(props: GraphRendererProps) {
  if (!props.live) return <SkiaRenderer {...props} />;
  return <LiveSkia {...props} live={props.live} />;
}

function LiveSkia({
  data,
  size,
  view,
  style,
  onRendered,
  live,
  pulse,
}: GraphRendererProps & { live: NonNullable<GraphRendererProps['live']> }) {
  const fonts = useMemo(makeFonts, []);
  const c = style.colours;
  const routing = style.routing ?? 'orthogonal';

  const specs = useMemo(() => {
    const index = new Map(live.ids.map((id, i) => [id, i]));
    // One gradient paint per category, shared by every glowing node in it.
    const glows = new Map<string, SkPaint>();
    const glowFor = (colour: string) => {
      let g = glows.get(colour);
      if (!g) glows.set(colour, (g = glowPaint(colour)));
      return g;
    };
    const nodes: NodeSpec[] = [];
    data.nodes.forEach((n, k) => {
      const i = index.get(n.id);
      if (i === undefined) return;
      const alpha = encode.nodeOpacity(n);
      const initial = encode.initial(n.label);
      const label = style.showLabels ? encode.shortLabel(n.label) : '';
      const image = n.photo ? photoImage(n.id, n.photo) : null;
      nodes.push({
        i,
        r: n.radius,
        photo: image ? photoSpec(image, alpha) : null,
        fill: paint(c.card, { alpha }),
        ring: paint(encode.ringColour(n, style), { stroke: 4, alpha }),
        bridgeRing: n.bridge ? paint(c.text, { stroke: 1.5, alpha: 0.7 * alpha }) : null,
        text: paint(c.text, { alpha }),
        initial,
        initialDx: centreOffset(initial, fonts.initial),
        label,
        labelDx: label ? centreOffset(label, fonts.label) : 0,
        labelPaint: paint(c.muted, { alpha }),
        glow: n.recent ? glowFor(encode.ringColour(n, style)) : null,
        phase: (k * 0.618) % 1,
      });
    });
    const square = routing === 'orthogonal';
    const edges: EdgeSpec[] = [];
    const tieGroups = new Map<string, TieGroup>();
    for (const e of data.edges) {
      if (e.kind === 'ego' && style.showEgoEdges === false) continue;
      if (e.kind === 'tie' && style.showTies === false) continue;
      const t = index.get(e.target);
      const s = e.source === ME_ID ? -1 : index.get(e.source);
      if (t === undefined || s === undefined) continue;
      const st = edgeStroke(e, style);
      const stroke = { stroke: st.width, alpha: st.opacity, square };
      if (e.kind === 'ego') {
        edges.push({ s, t, paint: paint(st.colour, stroke) });
        continue;
      }
      const key = `${st.colour}|${st.width}|${st.opacity}`;
      let g = tieGroups.get(key);
      if (!g) tieGroups.set(key, (g = { paint: paint(st.colour, stroke), ends: [] }));
      g.ends.push(s, t);
    }
    const me = { fill: paint(c.accent), text: paint(c.onAccent), dx: centreOffset('You', fonts.me) };

    const sets: SetSpec[] = [];
    if (style.showSets) {
      const members = new Map<Category, { members: number[]; radii: number[]; primary: boolean[] }>();
      for (const n of data.nodes) {
        const i = index.get(n.id);
        if (i === undefined) continue;
        n.categories.forEach((cat, k) => {
          let m = members.get(cat);
          if (!m) members.set(cat, (m = { members: [], radii: [], primary: [] }));
          m.members.push(i);
          m.radii.push(n.radius);
          m.primary.push(k === 0);
        });
      }
      for (const cat of SECTOR_ORDER) {
        const m = members.get(cat);
        if (!m) continue;
        const colour = c.category[cat];
        const bar = paint(colour, { stroke: SET_BAR });
        bar.setStrokeCap(StrokeCap.Round);
        const name = style.categoryNames?.[cat] ?? cat;
        sets.push({
          layer: paint('#000000', { alpha: SET_ALPHA }),
          fill: paint(colour),
          bar,
          label: paint(colour),
          halo: paint(c.card, { stroke: 4, alpha: 0.9 }),
          name,
          nameDx: centreOffset(name, fonts.set),
          ...m,
        });
      }
    }

    const rows = (style.rows ?? []).map((r) => ({ ...r, paint: paint(c.muted) }));
    const selectedNode = style.selectedNodeId ? data.nodes.find((n) => n.id === style.selectedNodeId) : undefined;
    const selectedIndex = selectedNode ? index.get(selectedNode.id) : undefined;
    const selected =
      selectedNode && selectedIndex !== undefined
        ? { i: selectedIndex, r: selectedNode.radius, paint: paint(c.accent, { stroke: 3 }) }
        : null;
    return {
      nodes,
      edges,
      ties: [...tieGroups.values()],
      me,
      sets,
      rows,
      selected,
      setMaxLink: style.setMaxLink ?? SET_MAX_LINK,
    };
  }, [data, live.ids, style, c, fonts, routing]);

  // Relationship-type sets, underneath everything. Each set is drawn opaque into its own
  // translucent layer, so a set is one even shade and where two sets overlap they combine.
  const setsPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    // Positions arrive just after the first render; until then there is nothing to place.
    if (xy.length < 2 * live.ids.length) return graphPicture(() => {});
    return graphPicture((canvas) => {
      for (const set of specs.sets) {
        canvas.saveLayer(set.layer);
        for (let k = 0; k < set.members.length; k++) {
          const i = set.members[k]!;
          canvas.drawCircle(xy[2 * i]!, xy[2 * i + 1]!, set.radii[k]! + SET_PAD, set.fill);
        }
        const links = spanningEdges(xy, set.members, specs.setMaxLink);
        for (let k = 0; k < links.length; k += 2) {
          const a = links[k]!;
          const b = links[k + 1]!;
          canvas.drawLine(xy[2 * a]!, xy[2 * a + 1]!, xy[2 * b]!, xy[2 * b + 1]!, set.bar);
        }
        canvas.restore();
      }
    });
  });

  useEffect(() => onRendered?.(), [specs, onRendered]);

  const edgesPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    // Positions arrive just after the first render; until then there is nothing to place.
    if (xy.length < 2 * live.ids.length) return graphPicture(() => {});
    return graphPicture((canvas) => {
      // Ties underneath: every segment of every tie in a band, in one drawPoints call.
      // Independent line segments take Skia's fast path; one big stroked path does not.
      for (const g of specs.ties) {
        const pts: { x: number; y: number }[] = [];
        for (let k = 0; k < g.ends.length; k += 2) {
          const a = g.ends[k]!;
          const b = g.ends[k + 1]!;
          const route = routeEdge('tie', xy[2 * a]!, xy[2 * a + 1]!, xy[2 * b]!, xy[2 * b + 1]!, routing);
          for (let i = 2; i + 1 < route.length; i += 2) {
            pts.push({ x: route[i - 2]!, y: route[i - 1]! }, { x: route[i]!, y: route[i + 1]! });
          }
        }
        canvas.drawPoints(PointMode.Lines, pts, g.paint);
      }
      for (const e of specs.edges) {
        const sx = e.s < 0 ? 0 : xy[2 * e.s]!;
        const sy = e.s < 0 ? 0 : xy[2 * e.s + 1]!;
        const route = routeEdge('ego', sx, sy, xy[2 * e.t]!, xy[2 * e.t + 1]!, routing);
        for (let i = 2; i + 1 < route.length; i += 2) {
          canvas.drawLine(route[i - 2]!, route[i - 1]!, route[i]!, route[i + 1]!, e.paint);
        }
      }
    });
  });

  const glowPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    // Positions arrive just after the first render; until then there is nothing to place.
    if (xy.length < 2 * live.ids.length) return graphPicture(() => {});
    const phase = pulse ? pulse.value : 0;
    return graphPicture((canvas) => {
      for (const n of specs.nodes) {
        if (!n.glow) continue;
        const k = Math.sin(TAU * (phase + n.phase));
        const r = n.r * GLOW_SCALE + 3 * k;
        n.glow.setAlphaf(0.55 + 0.3 * k);
        canvas.save();
        canvas.translate(xy[2 * n.i]!, xy[2 * n.i + 1]!);
        canvas.scale(r, r);
        canvas.drawCircle(0, 0, 1, n.glow);
        canvas.restore();
      }
    });
  });

  const nodesPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    // Positions arrive just after the first render; until then there is nothing to place.
    if (xy.length < 2 * live.ids.length) return graphPicture(() => {});
    return graphPicture((canvas) => {
      for (const n of specs.nodes) {
        const x = xy[2 * n.i]!;
        const y = xy[2 * n.i + 1]!;
        if (n.photo) drawPhoto(canvas, n.photo, x, y, n.r);
        else canvas.drawCircle(x, y, n.r, n.fill);
        canvas.drawCircle(x, y, n.r, n.ring);
        if (n.bridgeRing) canvas.drawCircle(x, y, n.r + BRIDGE_GAP, n.bridgeRing);
        if (!n.photo) canvas.drawText(n.initial, x + n.initialDx, y + 5, n.text, fonts.initial);
        if (n.label) canvas.drawText(n.label, x + n.labelDx, y + n.r + 13, n.labelPaint, fonts.label);
      }
      if (specs.selected) {
        const sel = specs.selected;
        canvas.drawCircle(xy[2 * sel.i]!, xy[2 * sel.i + 1]!, sel.r + BRIDGE_GAP + 4, sel.paint);
      }
      for (const r of specs.rows) canvas.drawText(r.label, r.x, r.y, r.paint, fonts.set);
      // On top of everything: each set's name, just outside its member furthest from you, so names
      // spread out in the direction each type sits rather than piling up at the top. Only people whose
      // main type it is count (when there are any). Names that still land on the same person
      // (e.g. one person who is the only member of two types) are stacked, not drawn over each other.
      const anchors: number[] = [];
      for (const set of specs.sets) {
        let best = -1;
        let far = -1;
        const anyPrimary = set.primary.indexOf(true) >= 0;
        for (let k = 0; k < set.members.length; k++) {
          if (anyPrimary && !set.primary[k]) continue;
          const i = set.members[k]!;
          const d = Math.hypot(xy[2 * i]!, xy[2 * i + 1]!) + set.radii[k]!;
          if (d > far) {
            far = d;
            best = k;
          }
        }
        if (best < 0) continue;
        const i = set.members[best]!;
        const x = xy[2 * i]!;
        const y = xy[2 * i + 1]!;
        const len = Math.hypot(x, y) || 1;
        const out = set.radii[best]! + SET_PAD + SET_LABEL_GAP;
        let stacked = 0;
        for (let a = 0; a < anchors.length; a++) if (anchors[a] === i) stacked++;
        anchors.push(i);
        // Text baseline: nudge down a little below the centre line, further when pointing down;
        // each extra name on the same person goes one line further out.
        const lx = x + (x / len) * out;
        const ly = y + (y / len) * out + (y > 0 ? 12 : 0) + (y > 0 ? 1 : -1) * SET_LABEL_LINE * stacked;
        canvas.drawText(set.name, lx + set.nameDx, ly, set.halo, fonts.set);
        canvas.drawText(set.name, lx + set.nameDx, ly, set.label, fonts.set);
      }
      canvas.drawCircle(0, 0, NODE_RADIUS + 4, specs.me.fill);
      canvas.drawText('You', specs.me.dx, 5, specs.me.text, fonts.me);
    });
  });

  // Graph point p lands at centre + (tx, ty) + scale * fit * p (same rule as every renderer).
  const transform = useDerivedValue(() => [
    { translateX: size.width / 2 + view.tx.value },
    { translateY: size.height / 2 + view.ty.value },
    { scale: view.scale.value * view.fit.value },
    ...GRAPH_UNSHIFT,
  ]);

  return (
    <Canvas style={{ width: size.width, height: size.height }}>
      <Group transform={transform}>
        <Picture picture={setsPicture} />
        <Picture picture={edgesPicture} />
        <Picture picture={glowPicture} />
        <Picture picture={nodesPicture} />
      </Group>
    </Canvas>
  );
}
