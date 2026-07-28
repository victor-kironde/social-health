import type { GraphRenderer } from '../model';
import { SkiaRenderer } from './SkiaRenderer';
import { SvgRenderer } from './SvgRenderer';

/**
 * Available graph renderers. To add one (e.g. a WebView or a live-physics
 * renderer), implement GraphRendererProps and register it here.
 */
export const GRAPH_RENDERERS = {
  skia: { label: 'Skia (GPU)', component: SkiaRenderer },
  svg: { label: 'SVG', component: SvgRenderer },
} satisfies Record<string, { label: string; component: GraphRenderer }>;

export type RendererId = keyof typeof GRAPH_RENDERERS;

export const DEFAULT_RENDERER: RendererId = 'skia';
