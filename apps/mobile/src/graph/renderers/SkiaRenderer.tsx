import {
  Canvas,
  Group,
  PaintStyle,
  Picture,
  Skia,
  createPicture,
  matchFont,
  type SkCanvas,
  type SkFont,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { Platform } from 'react-native';
import { useDerivedValue } from 'react-native-reanimated';
import { NODE_RADIUS, type Point } from '../layout';
import { ME_ID, encode, type GraphData, type GraphRendererProps, type GraphStyle } from '../model';

const FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

/**
 * Skia renderer: the whole graph is recorded once into an SkPicture and
 * replayed on the GPU. Pan and zoom only change the group transform, which
 * Skia reads straight from the shared values, so gestures never re-render React.
 */
export function SkiaRenderer({ data, positions, size, fit, view, style, onRendered }: GraphRendererProps) {
  const fonts = useMemo(
    () => ({
      initial: matchFont({ fontFamily: FAMILY, fontSize: 14, fontWeight: '600' }),
      label: matchFont({ fontFamily: FAMILY, fontSize: 10 }),
      me: matchFont({ fontFamily: FAMILY, fontSize: 13, fontWeight: '700' }),
    }),
    [],
  );

  const picture = useMemo(
    () => createPicture((canvas) => drawGraph(canvas, data, positions, style, fonts)),
    [data, positions, style, fonts],
  );

  useEffect(() => onRendered?.(), [picture, onRendered]);

  // Graph point p lands at centre + (tx, ty) + scale * fit * p.
  const transform = useDerivedValue(() => [
    { translateX: size.width / 2 + view.tx.value },
    { translateY: size.height / 2 + view.ty.value },
    { scale: view.scale.value * fit },
  ]);

  return (
    <Canvas style={{ width: size.width, height: size.height }}>
      <Group transform={transform}>
        <Picture picture={picture} />
      </Group>
    </Canvas>
  );
}

function paint(colour: string, opts: { stroke?: number; alpha?: number } = {}) {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(colour));
  if (opts.stroke !== undefined) {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(opts.stroke);
  }
  if (opts.alpha !== undefined) p.setAlphaf(opts.alpha);
  return p;
}

function drawCentredText(canvas: SkCanvas, text: string, x: number, baseline: number, font: SkFont, colour: string, alpha = 1) {
  const width = font.measureText(text).width;
  canvas.drawText(text, x - width / 2, baseline, paint(colour, { alpha }), font);
}

function drawGraph(
  canvas: SkCanvas,
  data: GraphData,
  positions: Map<string, Point>,
  style: GraphStyle,
  fonts: { initial: SkFont; label: SkFont; me: SkFont },
) {
  const c = style.colours;

  for (const e of data.edges) {
    const a = e.source === ME_ID ? { x: 0, y: 0 } : positions.get(e.source)!;
    const b = positions.get(e.target)!;
    canvas.drawLine(
      a.x,
      a.y,
      b.x,
      b.y,
      paint(encode.edgeColour(e, style), { stroke: encode.edgeWidth(e.importance), alpha: encode.edgeOpacity(e.behind) }),
    );
  }

  for (const n of data.nodes) {
    const p = positions.get(n.id)!;
    const alpha = encode.nodeOpacity(n.behind);
    canvas.drawCircle(p.x, p.y, NODE_RADIUS, paint(c.card, { alpha }));
    canvas.drawCircle(p.x, p.y, NODE_RADIUS, paint(c.category[n.category], { stroke: 4, alpha }));
    drawCentredText(canvas, encode.initial(n.label), p.x, p.y + 5, fonts.initial, c.text, alpha);
    if (style.showLabels) {
      drawCentredText(canvas, encode.shortLabel(n.label), p.x, p.y + NODE_RADIUS + 13, fonts.label, c.muted, alpha);
    }
  }

  canvas.drawCircle(0, 0, NODE_RADIUS + 4, paint(c.accent));
  drawCentredText(canvas, 'You', 0, 5, fonts.me, c.onAccent);
}
