import { Canvas, Group, Picture, createPicture, type SkPaint } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { NODE_RADIUS } from '../layout';
import { ME_ID, encode, type GraphRendererProps } from '../model';
import { SkiaRenderer } from './SkiaRenderer';
import { centreOffset, glowPaint, makeFonts, paint } from './skiaKit';

/** Everything needed to draw one node, prepared on JS so the per-frame worklet only reads it. */
interface NodeSpec {
  i: number;
  fill: SkPaint;
  ring: SkPaint;
  text: SkPaint;
  initial: string;
  initialDx: number;
  label: string;
  labelDx: number;
  labelPaint: SkPaint;
  glow: SkPaint | null;
  /** Per-node phase offset so pulses are not in lockstep. */
  phase: number;
}

interface EdgeSpec {
  s: number; // -1 = the user at the origin
  t: number;
  paint: SkPaint;
}

const TAU = Math.PI * 2;
/** Halo radius; the node itself covers the inner NODE_RADIUS. */
const GLOW_RADIUS = NODE_RADIUS * 1.75;

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

function LiveSkia({ data, size, view, style, onRendered, live, pulse }: GraphRendererProps & { live: NonNullable<GraphRendererProps['live']> }) {
  const fonts = useMemo(makeFonts, []);
  const c = style.colours;

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
      const alpha = encode.nodeOpacity(n.behind);
      const initial = encode.initial(n.label);
      const label = style.showLabels ? encode.shortLabel(n.label) : '';
      nodes.push({
        i,
        fill: paint(c.card, { alpha }),
        ring: paint(c.category[n.category], { stroke: 4, alpha }),
        text: paint(c.text, { alpha }),
        initial,
        initialDx: centreOffset(initial, fonts.initial),
        label,
        labelDx: label ? centreOffset(label, fonts.label) : 0,
        labelPaint: paint(c.muted, { alpha }),
        glow: n.recent ? glowFor(c.category[n.category]) : null,
        phase: (k * 0.618) % 1,
      });
    });
    const edges: EdgeSpec[] = [];
    for (const e of data.edges) {
      const t = index.get(e.target);
      const s = e.source === ME_ID ? -1 : index.get(e.source);
      if (t === undefined || s === undefined) continue;
      edges.push({
        s,
        t,
        paint: paint(encode.edgeColour(e, style), { stroke: encode.edgeWidth(e.importance), alpha: encode.edgeOpacity(e.behind) }),
      });
    }
    const me = { fill: paint(c.accent), text: paint(c.onAccent), dx: centreOffset('You', fonts.me) };
    return { nodes, edges, me };
  }, [data, live.ids, style, c, fonts]);

  useEffect(() => onRendered?.(), [specs, onRendered]);

  const edgesPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    return createPicture((canvas) => {
      for (const e of specs.edges) {
        const sx = e.s < 0 ? 0 : xy[2 * e.s]!;
        const sy = e.s < 0 ? 0 : xy[2 * e.s + 1]!;
        canvas.drawLine(sx, sy, xy[2 * e.t]!, xy[2 * e.t + 1]!, e.paint);
      }
    });
  });

  const glowPicture = useDerivedValue(() => {
    const xy = live.xy.value;
    const phase = pulse ? pulse.value : 0;
    return createPicture((canvas) => {
      for (const n of specs.nodes) {
        if (!n.glow) continue;
        const k = Math.sin(TAU * (phase + n.phase));
        const r = GLOW_RADIUS + 3 * k;
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
    return createPicture((canvas) => {
      for (const n of specs.nodes) {
        const x = xy[2 * n.i]!;
        const y = xy[2 * n.i + 1]!;
        canvas.drawCircle(x, y, NODE_RADIUS, n.fill);
        canvas.drawCircle(x, y, NODE_RADIUS, n.ring);
        canvas.drawText(n.initial, x + n.initialDx, y + 5, n.text, fonts.initial);
        if (n.label) canvas.drawText(n.label, x + n.labelDx, y + NODE_RADIUS + 13, n.labelPaint, fonts.label);
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
  ]);

  return (
    <Canvas style={{ width: size.width, height: size.height }}>
      <Group transform={transform}>
        <Picture picture={edgesPicture} />
        <Picture picture={glowPicture} />
        <Picture picture={nodesPicture} />
      </Group>
    </Canvas>
  );
}
