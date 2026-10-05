import {
  FilterMode,
  createPicture,
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
  type SkPath,
  type SkPaint,
  type SkPicture,
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

/**
 * Appends a routed line ([x0, y0, x1, y1, …]) to `path`, rounding each turn with a small curve
 * (radius 10 by default, never more than half of either neighbouring segment). A literal default:
 * a worklet cannot read module constants.
 */
export function addRoundedRoute(path: SkPath, route: number[], radius = 10) {
  'worklet';
  const n = route.length / 2;
  if (n < 2) return;
  path.moveTo(route[0]!, route[1]!);
  for (let i = 1; i < n - 1; i++) {
    const px = route[2 * i - 2]!;
    const py = route[2 * i - 1]!;
    const x = route[2 * i]!;
    const y = route[2 * i + 1]!;
    const qx = route[2 * i + 2]!;
    const qy = route[2 * i + 3]!;
    const inLen = Math.hypot(x - px, y - py);
    const outLen = Math.hypot(qx - x, qy - y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0.5) {
      path.lineTo(x, y);
      continue;
    }
    path.lineTo(x - ((x - px) / inLen) * r, y - ((y - py) / inLen) * r);
    path.quadTo(x, y, x + ((qx - x) / outLen) * r, y + ((qy - y) / outLen) * r);
  }
  path.lineTo(route[2 * n - 2]!, route[2 * n - 1]!);
}

/** Fills a rounded square (a group: centre x, y, half-side r, corner c) with the photo. Safe to call from a worklet. */
export function drawPhotoSquare(canvas: SkCanvas, photo: PhotoSpec, x: number, y: number, r: number, c: number) {
  'worklet';
  canvas.save();
  canvas.translate(x - r, y - r);
  const sx = (2 * r) / photo.width;
  const sy = (2 * r) / photo.height;
  canvas.scale(sx, sy);
  canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(0, 0, photo.width, photo.height), c / sx, c / sy), photo.paint);
  canvas.restore();
}

/**
 * The on-screen graph as a PNG (base64), for the PDF report. The live renderer registers itself
 * while it is mounted; null when no graph is showing.
 */
export const graphSnapshot: { capture: null | (() => Promise<string | null>) } = { capture: null };

/**
 * The graph screen's picture-taker for the report: clears any selection, optionally re-draws with
 * numbers instead of names and photos, and returns the picture with the background it sits on.
 */
export const reportGraph: {
  capture: null | ((opts: { anonymous: boolean }) => Promise<{ png: string; background: string } | null>);
} = { capture: null };

/** Fills the circle (x, y, r) with the photo, scaled to fit. Safe to call from a worklet. */
export function drawPhoto(canvas: SkCanvas, photo: PhotoSpec, x: number, y: number, r: number) {
  'worklet';
  canvas.save();
  canvas.translate(x - r, y - r);
  canvas.scale((2 * r) / photo.width, (2 * r) / photo.height);
  canvas.drawCircle(photo.width / 2, photo.height / 2, photo.width / 2, photo.paint);
  canvas.restore();
}

/**
 * Without explicit bounds, a recorded picture's bounds are (0, 0)-(2e6, 2e6): positive
 * coordinates only. The graph is centred on (0, 0), so when zoomed in on people above or left of
 * you, Skia judged the whole picture off screen and skipped it (the graph vanished). Recording
 * with this offset keeps everything in positive space; GRAPH_UNSHIFT moves it back when drawn.
 * Offsetting rather than passing bounds avoids building a spatial index on every frame. The offset
 * is far larger than any graph (a few thousand units at most) yet small enough that float rounding
 * in the combined transform stays well under a pixel at full zoom.
 */
export const PICTURE_OFFSET = 20_000;

/** Records a picture in graph coordinates, shifted into the picture's positive bounds. */
export function graphPicture(draw: (canvas: SkCanvas) => void): SkPicture {
  'worklet';
  return createPicture((canvas) => {
    canvas.translate(PICTURE_OFFSET, PICTURE_OFFSET);
    draw(canvas);
  });
}

/** Append to a renderer's group transform (after the scale) to undo graphPicture's shift. */
export const GRAPH_UNSHIFT = [{ translateX: -PICTURE_OFFSET }, { translateY: -PICTURE_OFFSET }] as const;
