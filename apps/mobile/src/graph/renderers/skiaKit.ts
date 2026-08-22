import {
  FilterMode,
  MipmapMode,
  PaintStyle,
  Skia,
  StrokeCap,
  StrokeJoin,
  TileMode,
  matchFont,
  type SkCanvas,
  type SkFont,
  type SkImage,
  type SkPaint,
} from '@shopify/react-native-skia';
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

/** Decoded photos, by content, so re-renders and renderer switches never decode twice. */
const photoCache = new Map<string, SkImage | null>();

function photoKey(personId: string, jpeg: string) {
  return `${personId}:${jpeg.length}:${jpeg.slice(-24)}`;
}

/** A person's photo as a Skia image (null if it cannot be decoded). */
export function photoImage(personId: string, jpeg: string): SkImage | null {
  const key = photoKey(personId, jpeg);
  if (!photoCache.has(key)) {
    let image: SkImage | null = null;
    try {
      image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBase64(jpeg));
    } catch {
      image = null;
    }
    photoCache.set(key, image);
  }
  return photoCache.get(key) ?? null;
}

/** A photo to draw inside a person's circle: an image shader, so no per-frame clipping. */
export interface PhotoSpec {
  paint: SkPaint;
  width: number;
  height: number;
}

export function photoSpec(image: SkImage, alpha = 1): PhotoSpec {
  const p = Skia.Paint();
  p.setAntiAlias(true);
  p.setShader(image.makeShaderOptions(TileMode.Clamp, TileMode.Clamp, FilterMode.Linear, MipmapMode.None));
  p.setAlphaf(alpha);
  return { paint: p, width: image.width(), height: image.height() };
}

/** Fills the circle (x, y, r) with the photo, scaled to fit. Safe to call from a worklet. */
export function drawPhoto(canvas: SkCanvas, photo: PhotoSpec, x: number, y: number, r: number) {
  'worklet';
  canvas.save();
  canvas.translate(x - r, y - r);
  canvas.scale((2 * r) / photo.width, (2 * r) / photo.height);
  canvas.drawCircle(photo.width / 2, photo.height / 2, photo.width / 2, photo.paint);
  canvas.restore();
}
