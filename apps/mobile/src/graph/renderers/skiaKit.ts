import { PaintStyle, Skia, StrokeCap, StrokeJoin, TileMode, matchFont, type SkFont, type SkPaint } from '@shopify/react-native-skia';
import { Platform } from 'react-native';

/** Shared Skia helpers for the Skia-based renderers. */

const FAMILY = Platform.select({ ios: 'Helvetica', default: 'sans-serif' });

export interface GraphFonts {
  initial: SkFont;
  label: SkFont;
  me: SkFont;
  /** Set names and row captions. */
  set: SkFont;
}

export function makeFonts(): GraphFonts {
  return {
    initial: matchFont({ fontFamily: FAMILY, fontSize: 14, fontWeight: '600' }),
    label: matchFont({ fontFamily: FAMILY, fontSize: 10 }),
    me: matchFont({ fontFamily: FAMILY, fontSize: 13, fontWeight: '700' }),
    set: matchFont({ fontFamily: FAMILY, fontSize: 12, fontWeight: '700' }),
  };
}

export function paint(colour: string, opts: { stroke?: number; alpha?: number; square?: boolean } = {}): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setColor(Skia.Color(colour));
  if (opts.stroke !== undefined) {
    p.setStyle(PaintStyle.Stroke);
    p.setStrokeWidth(opts.stroke);
  }
  if (opts.alpha !== undefined) p.setAlphaf(opts.alpha);
  // Square caps and mitred joins keep right-angled routes crisp at the corners.
  if (opts.square) {
    p.setStrokeCap(StrokeCap.Square);
    p.setStrokeJoin(StrokeJoin.Miter);
  }
  return p;
}

/** `#rrggbb` with an alpha, as a Skia colour. */
function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return Skia.Color(`rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`);
}

/**
 * A soft halo as a radial gradient on a unit circle at the origin. Draw it
 * with canvas.translate/scale per node: far cheaper per frame than a blur.
 */
export function glowPaint(colour: string): SkPaint {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(
    Skia.Shader.MakeRadialGradient(
      { x: 0, y: 0 },
      1,
      [withAlpha(colour, 0.85), withAlpha(colour, 0.35), withAlpha(colour, 0)],
      [0, 0.55, 1],
      TileMode.Clamp,
    ),
  );
  return p;
}

/** Horizontal offset that centres `text` on x when drawn with `font`. */
export function centreOffset(text: string, font: SkFont): number {
  return -font.measureText(text).width / 2;
}
