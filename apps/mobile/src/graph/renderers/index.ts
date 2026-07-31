import type { GraphRenderer } from '../model';
import { LiveSkiaRenderer } from './LiveSkiaRenderer';
import { SkiaRenderer } from './SkiaRenderer';
import { SvgRenderer } from './SvgRenderer';

/**
 * Available graph renderers. To add one (e.g. a WebView), implement
 * GraphRendererProps and register it here. `live: true` renderers draw from
 * per-frame positions and get the physics simulation, dragging and pulsing;
 * static ones get a one-shot layout.
 */
export const GRAPH_RENDERERS = {
  live: { label: 'Live (Skia)', component: LiveSkiaRenderer, live: true },
  skia: { label: 'Skia (static)', component: SkiaRenderer, live: false },
  svg: { label: 'SVG', component: SvgRenderer, live: false },
} satisfies Record<string, { label: string; component: GraphRenderer; live: boolean }>;

export type RendererId = keyof typeof GRAPH_RENDERERS;

export const DEFAULT_RENDERER: RendererId = 'live';
