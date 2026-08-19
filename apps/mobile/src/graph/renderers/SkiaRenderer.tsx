import { Canvas, Group, Picture, Skia, createPicture, type SkCanvas, type SkFont } from '@shopify/react-native-skia';
import { routeEdge } from '../geometry';
import { useEffect, useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import { NODE_RADIUS, type Point } from '../layout';
import { ME_ID, edgeStroke, encode, type GraphData, type GraphRendererProps, type GraphStyle } from '../model';
import { centreOffset, makeFonts, paint, type GraphFonts } from './skiaKit';

/**
 * Skia renderer: the whole graph is recorded once into an SkPicture and
 * replayed on the GPU. Pan and zoom only change the group transform, which
 * Skia reads straight from the shared values, so gestures never re-render React.
 */
export function SkiaRenderer({ data, positions, size, view, style, onRendered }: GraphRendererProps) {
  const fonts = useMemo(makeFonts, []);

  const picture = useMemo(
    () => createPicture((canvas) => drawGraph(canvas, data, positions, style, fonts)),
    [data, positions, style, fonts],
  );

  useEffect(() => onRendered?.(), [picture, onRendered]);

  // Graph point p lands at centre + (tx, ty) + scale * fit * p.
  const transform = useDerivedValue(() => [
    { translateX: size.width / 2 + view.tx.value },
    { translateY: size.height / 2 + view.ty.value },
    { scale: view.scale.value * view.fit.value },
  ]);

  return (
    <Canvas style={{ width: size.width, height: size.height }}>
      <Group transform={transform}>
        <Picture picture={picture} />
      </Group>
    </Canvas>
  );
}

function drawCentredText(canvas: SkCanvas, text: string, x: number, baseline: number, font: SkFont, colour: string, alpha = 1) {
  canvas.drawText(text, x + centreOffset(text, font), baseline, paint(colour, { alpha }), font);
}

function drawGraph(
  canvas: SkCanvas,
  data: GraphData,
  positions: Map<string, Point>,
  style: GraphStyle,
  fonts: GraphFonts,
) {
  const c = style.colours;

  const routing = style.routing ?? 'orthogonal';
  for (const e of data.edges) {
    const a = e.source === ME_ID ? { x: 0, y: 0 } : positions.get(e.source)!;
    const b = positions.get(e.target)!;
    const st = edgeStroke(e, style);
    const pts = routeEdge(e.kind, a.x, a.y, b.x, b.y, routing);
    const path = Skia.Path.Make();
    path.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i + 1 < pts.length; i += 2) path.lineTo(pts[i]!, pts[i + 1]!);
    canvas.drawPath(path, paint(st.colour, { stroke: st.width, alpha: st.opacity, square: routing === 'orthogonal' }));
  }

  for (const n of data.nodes) {
    const p = positions.get(n.id)!;
    const alpha = encode.nodeOpacity(n.behind);
    canvas.drawCircle(p.x, p.y, NODE_RADIUS, paint(c.card, { alpha }));
    canvas.drawCircle(p.x, p.y, NODE_RADIUS, paint(encode.ringColour(n, style), { stroke: 4, alpha }));
    if (n.bridge) canvas.drawCircle(p.x, p.y, NODE_RADIUS + 6, paint(c.text, { stroke: 1.5, alpha: 0.7 * alpha }));
    drawCentredText(canvas, encode.initial(n.label), p.x, p.y + 5, fonts.initial, c.text, alpha);
    if (style.showLabels) {
      drawCentredText(canvas, encode.shortLabel(n.label), p.x, p.y + NODE_RADIUS + 13, fonts.label, c.muted, alpha);
    }
  }

  canvas.drawCircle(0, 0, NODE_RADIUS + 4, paint(c.accent));
  drawCentredText(canvas, 'You', 0, 5, fonts.me, c.onAccent);
}
