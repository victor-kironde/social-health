import { BlurStyle, ClipOp, Canvas, Group, Picture, Skia, type SkPaint } from '@shopify/react-native-skia';
import type { Category } from '@sg/score-engine';
import type { HealthBand } from '../../data/health';
import { routeEdge } from '../geometry';
import { useEffect, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { NODE_RADIUS, SECTOR_ORDER } from '../layout';
import { ME_ID, edgeStroke, encode, type GraphRendererProps } from '../model';
import { SkiaRenderer } from './SkiaRenderer';
import {
  GRAPH_UNSHIFT,
  addRoundedRoute,
  PICTURE_OFFSET,
  centreOffset,
  drawPhoto,
  drawPhotoSquare,
  graphPicture,
  graphSnapshot,
  makeFonts,
  paint,
  photoImage,
  photoSpec,
  type PhotoSpec,
} from './skiaKit';

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
  /** Groups are drawn as rounded squares. */
  square: boolean;
  /** Under a collapsed group's name: "+12 hidden". */
  badge: string;
  badgeDx: number;
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
/** How far a type area's edge fades out (blur sigma, graph units). */
const SET_FADE = 6;

/** A type area's fill: its edges fade softly, so it reads as shading, never as a solid group square. */
function softFill(colour: string): SkPaint {
  const p = paint(colour);
  p.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, SET_FADE, true));
  return p;
}

/** Corner radius of a type area. */
const SET_CORNER = 22;
/** How far a set reaches beyond its members' circles. */
const SET_PAD = 14;
/** Opacity of each set: low, so two overlapping sets read as a third, darker shade. */
const SET_ALPHA = 0.17;

/**
 * Live Skia renderer: draws from per-frame positions published by the live
 * simulation. Three layers are recorded on the UI thread: edges and nodes
 * (re-recorded only when positions change) and a water-wave layer for people in
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
    // One wave paint per colour, shared by every node in recent contact with it.
    const glows = new Map<string, SkPaint>();
    const glowFor = (colour: string) => {
      let g = glows.get(colour);
      if (!g) glows.set(colour, (g = paint(colour)));
      return g;
    };
    const nodes: NodeSpec[] = [];
    data.nodes.forEach((n, k) => {
      const i = index.get(n.id);
      if (i === undefined) return;
      const alpha = encode.nodeOpacity(n);
      const initial = n.initial ?? encode.initial(n.label);
      const label = style.showLabels ? encode.shortLabel(n.label) : '';
      const image = n.photo ? photoImage(n.id, n.photo) : null;
      const badge = n.isGroup && n.collapsed && n.memberCount ? `+${n.memberCount} inside` : '';
      nodes.push({
        i,
        r: n.radius,
        square: !!n.isGroup,
        badge,
        badgeDx: badge ? centreOffset(badge, fonts.label) : 0,
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
    const meLabel = data.me?.label ?? 'You';
    const meImage = data.me?.photo ? photoImage(ME_ID, data.me.photo) : null;
    const me = {
      fill: paint(c.accent),
      ring: paint(c.accent, { stroke: 4 }),
      text: paint(c.onAccent),
      dx: centreOffset('You', fonts.me),
      photo: meImage ? photoSpec(meImage) : null,
      // Under your circle: their name, when they have a photo or a name of their own.
      label: meImage || meLabel !== 'You' ? encode.shortLabel(meLabel) : '',
      labelPaint: paint(c.text),
      labelDx: centreOffset(encode.shortLabel(meLabel), fonts.label),
    };

    const sets: SetSpec[] = [];
    if (style.showSets) {
      const custom = style.areas;
      const members = new Map<string, { members: number[]; radii: number[]; primary: boolean[]; health: HealthBand[] }>();
      for (const n of data.nodes) {
        const i = index.get(n.id);
        if (i === undefined) continue;
        (custom ? (n.areas ?? []) : n.categories).forEach((cat, k) => {
          let m = members.get(cat);
          if (!m) members.set(cat, (m = { members: [], radii: [], primary: [], health: [] }));
          m.members.push(i);
          m.radii.push(n.radius);
          m.primary.push(k === 0);
          m.health.push(n.health);
        });
      }
      for (const cat of custom ? custom.order : (SECTOR_ORDER as string[])) {
        const m = members.get(cat);
        if (!m) continue;
        // Coloured by health: the area takes the overall health of the relationships in it.
        // Otherwise each type (or group) keeps its own muted colour.
        const own = custom ? (custom.colours[cat] ?? c.edge) : c.category[cat as Category];
        // Always the type's (or group's) own colour, never a health colour, so an area never reads as a rating.
        const colour = own;
        const name = custom ? (custom.names[cat] ?? cat) : (style.categoryNames?.[cat as Category] ?? cat);
        sets.push({
          layer: paint('#000000', { alpha: SET_ALPHA }),
          fill: softFill(colour),
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
    };
  }, [data, live.ids, style, c, fonts, routing]);

  // Relationship-type areas, underneath everything: one rounded rectangle around each type's
  // members, drawn in a translucent layer so where two areas overlap they combine.
  const setsPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    // Positions arrive just after the first render; until then there is nothing to place.
    if (xy.length < 2 * live.ids.length) return graphPicture(() => {});
    return graphPicture((canvas) => {
      for (const set of specs.sets) {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (let k = 0; k < set.members.length; k++) {
          const i = set.members[k]!;
          const r = set.radii[k]! + SET_PAD;
          minX = Math.min(minX, xy[2 * i]! - r);
          maxX = Math.max(maxX, xy[2 * i]! + r);
          minY = Math.min(minY, xy[2 * i + 1]! - r);
          maxY = Math.max(maxY, xy[2 * i + 1]! + r);
        }
        if (minX === Infinity) continue;
        canvas.saveLayer(set.layer);
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(minX, minY, maxX - minX, maxY - minY), SET_CORNER, SET_CORNER), set.fill);
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
      // Ties underneath: every tie in a band as one path (one draw call), with rounded turns.
      for (const g of specs.ties) {
        const path = Skia.Path.Make();
        for (let k = 0; k < g.ends.length; k += 2) {
          const a = g.ends[k]!;
          const b = g.ends[k + 1]!;
          addRoundedRoute(path, routeEdge('tie', xy[2 * a]!, xy[2 * a + 1]!, xy[2 * b]!, xy[2 * b + 1]!, routing));
        }
        canvas.drawPath(path, g.paint);
      }
      for (const e of specs.edges) {
        const sx = e.s < 0 ? 0 : xy[2 * e.s]!;
        const sy = e.s < 0 ? 0 : xy[2 * e.s + 1]!;
        const path = Skia.Path.Make();
        addRoundedRoute(path, routeEdge('ego', sx, sy, xy[2 * e.t]!, xy[2 * e.t + 1]!, routing));
        canvas.drawPath(path, e.paint);
      }
    });
  });

  // In touch recently: a small water wave rolling across the bottom of the person (or group), in
  // their own colour, drawn over their photo or initial and inside their ring.
  const glowPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    // Positions arrive just after the first render; until then there is nothing to place.
    if (xy.length < 2 * live.ids.length) return graphPicture(() => {});
    const phase = pulse ? pulse.value : 0;
    return graphPicture((canvas) => {
      for (const n of specs.nodes) {
        if (!n.glow) continue;
        const x = xy[2 * n.i]!;
        const y = xy[2 * n.i + 1]!;
        const r = n.r - 1.5;
        const t = TAU * (phase + n.phase);
        canvas.save();
        const box = Skia.XYWHRect(x - r, y - r, 2 * r, 2 * r);
        const corner = n.square ? n.r * 0.35 : r;
        canvas.clipRRect(Skia.RRectXY(box, corner, corner), ClipOp.Intersect, true);
        // Two layers of wave, the back one fainter and out of step, for a sense of water.
        for (let layer = 0; layer < 2; layer++) {
          const level = y + r * (0.38 + 0.05 * Math.sin(t + layer)) + layer * r * 0.08;
          const amp = r * (layer ? 0.07 : 0.1);
          const len = r * 1.3;
          const shift = (layer ? -1 : 1) * t * len * 0.35;
          const path = Skia.Path.Make();
          path.moveTo(x - r - len, y + r + 2);
          for (let px = x - r - len; px <= x + r + len; px += 3) {
            path.lineTo(px, level + amp * Math.sin(((px - x + shift) / len) * TAU));
          }
          path.lineTo(x + r + len, y + r + 2);
          path.close();
          n.glow.setAlphaf(layer ? 0.35 : 0.6);
          canvas.drawPath(path, n.glow);
        }
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
        if (n.square) {
          // A group: a rounded square, so it never reads as one person.
          const box = Skia.RRectXY(Skia.XYWHRect(x - n.r, y - n.r, 2 * n.r, 2 * n.r), n.r * 0.35, n.r * 0.35);
          if (n.photo) drawPhotoSquare(canvas, n.photo, x, y, n.r, n.r * 0.35);
          else canvas.drawRRect(box, n.fill);
          canvas.drawRRect(box, n.ring);
        } else {
          if (n.photo) drawPhoto(canvas, n.photo, x, y, n.r);
          else canvas.drawCircle(x, y, n.r, n.fill);
          canvas.drawCircle(x, y, n.r, n.ring);
        }
        if (n.bridgeRing) canvas.drawCircle(x, y, n.r + BRIDGE_GAP, n.bridgeRing);
        if (!n.photo) canvas.drawText(n.initial, x + n.initialDx, y + 5, n.text, fonts.initial);
        if (n.label) canvas.drawText(n.label, x + n.labelDx, y + n.r + 13, n.labelPaint, fonts.label);
        if (n.badge) canvas.drawText(n.badge, x + n.badgeDx, y + n.r + (n.label ? 26 : 13), n.labelPaint, fonts.label);
      }
      if (specs.selected) {
        const sel = specs.selected;
        canvas.drawCircle(xy[2 * sel.i]!, xy[2 * sel.i + 1]!, sel.r + BRIDGE_GAP + 4, sel.paint);
      }
      for (const r of specs.rows) canvas.drawText(r.label, r.x, r.y, r.paint, fonts.set);
      // On top of everything: each area's name, just above its rectangle's top-left corner.
      for (const set of specs.sets) {
        let minX = Infinity;
        let minY = Infinity;
        for (let k = 0; k < set.members.length; k++) {
          const i = set.members[k]!;
          minX = Math.min(minX, xy[2 * i]! - set.radii[k]! - SET_PAD);
          minY = Math.min(minY, xy[2 * i + 1]! - set.radii[k]! - SET_PAD);
        }
        if (minX === Infinity) continue;
        const lx = minX + SET_CORNER * 0.6;
        const ly = minY - 6;
        canvas.drawText(set.name, lx, ly, set.halo, fonts.set);
        canvas.drawText(set.name, lx, ly, set.label, fonts.set);
      }
      const meR = NODE_RADIUS + 6;
      if (specs.me.photo) {
        drawPhoto(canvas, specs.me.photo, 0, 0, meR);
        canvas.drawCircle(0, 0, meR, specs.me.ring);
      } else {
        canvas.drawCircle(0, 0, meR, specs.me.fill);
        canvas.drawText('You', specs.me.dx, 5, specs.me.text, fonts.me);
      }
      if (specs.me.label) canvas.drawText(specs.me.label, specs.me.labelDx, meR + 14, specs.me.labelPaint, fonts.label);
    });
  });

  // Graph point p lands at centre + (tx, ty) + scale * fit * p (same rule as every renderer).
  const transform = useDerivedValue(() => [
    { translateX: size.width / 2 + view.tx.value },
    { translateY: size.height / 2 + view.ty.value },
    { scale: view.scale.value * view.fit.value },
    ...GRAPH_UNSHIFT,
  ]);

  // Lets the PDF report take a picture of the graph: the same recorded drawings, replayed onto an
  // offscreen surface framed around everyone (snapshotting the view itself crashes while it is
  // hidden under another screen).
  useEffect(() => {
    const capture = async () => {
      const xy = live.xy.value;
      if (xy.length < 2 * live.ids.length) return null;
      // Everyone drawn, you, and room for rings, labels and area names.
      let minX = -60;
      let minY = -60;
      let maxX = 60;
      let maxY = 60;
      for (const n of specs.nodes) {
        const x = xy[2 * n.i]!;
        const y = xy[2 * n.i + 1]!;
        const r = n.r + SET_PAD + 30;
        minX = Math.min(minX, x - r - 40);
        maxX = Math.max(maxX, x + r + 40);
        minY = Math.min(minY, y - r - 20);
        maxY = Math.max(maxY, y + r + 30);
      }
      const width = 1800;
      const k = width / (maxX - minX);
      const height = Math.max(400, Math.round((maxY - minY) * k));
      const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
      if (!surface) return null;
      const canvas = surface.getCanvas();
      canvas.scale(k, k);
      canvas.translate(-minX - PICTURE_OFFSET, -minY - PICTURE_OFFSET);
      for (const picture of [setsPicture.value, edgesPicture.value, nodesPicture.value, glowPicture.value]) canvas.drawPicture(picture);
      surface.flush();
      return surface.makeImageSnapshot().encodeToBase64();
    };
    graphSnapshot.capture = capture;
    return () => {
      if (graphSnapshot.capture === capture) graphSnapshot.capture = null;
    };
  }, [live, specs, setsPicture, edgesPicture, glowPicture, nodesPicture]);

  return (
    <Canvas style={{ width: size.width, height: size.height }}>
      <Group transform={transform}>
        <Picture picture={setsPicture} />
        <Picture picture={edgesPicture} />
        <Picture picture={nodesPicture} />
        <Picture picture={glowPicture} />
      </Group>
    </Canvas>
  );
}
