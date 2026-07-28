import type { Category, Rating, RelationshipContribution } from '@sg/score-engine';
import type { ComponentType } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import type { Point } from './layout';

/**
 * Renderer-independent description of the network graph. Anything that can
 * draw a GraphData at the given positions (SVG, Skia, a WebView, ...) can be
 * plugged in as a GraphRenderer without touching layout, gestures or data.
 */

/** The user, drawn at the origin. Ego edges run from here to each person. */
export const ME_ID = '__me__';

export interface GraphNode {
  id: string;
  label: string;
  category: Category;
  importance: Rating;
  quality: Rating | null;
  /** Behind their usual rhythm: drawn faded. */
  behind: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  /** 'ego' = you to a person. Person-to-person ties will be a second kind. */
  kind: 'ego';
  importance: Rating;
  quality: Rating | null;
  behind: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphColours {
  card: string;
  text: string;
  muted: string;
  accent: string;
  onAccent: string;
  edge: string;
  category: Record<Category, string>;
  quality: Record<Rating, string>;
}

export interface GraphStyle {
  colours: GraphColours;
  colourByQuality: boolean;
  showLabels: boolean;
}

/** Pan/zoom, updated on the UI thread by gestures. Renderers read, never write. */
export interface ViewValues {
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  scale: SharedValue<number>;
}

/**
 * The contract every renderer implements. Graph (0, 0) must be drawn at the
 * centre of `size`, a graph point p at  centre + (tx, ty) + scale * fit * p,
 * which is what screenToGraph() inverts for hit testing.
 */
export interface GraphRendererProps {
  data: GraphData;
  positions: Map<string, Point>;
  size: { width: number; height: number };
  /** Pixels per graph unit at scale 1. */
  fit: number;
  view: ViewValues;
  style: GraphStyle;
  /** Called once the renderer has committed a new drawing (for timing). */
  onRendered?: () => void;
}

export type GraphRenderer = ComponentType<GraphRendererProps>;

/** Build the drawable graph from scored relationships. Pure; no drawing concerns. */
export function buildGraph(relationships: RelationshipContribution[], names: Map<string, string>): GraphData {
  const behind = (r: RelationshipContribution) => r.onRhythm !== null && r.onRhythm < 0.5;
  return {
    nodes: relationships.map((r) => ({
      id: r.personId,
      label: names.get(r.personId) ?? '?',
      category: r.category,
      importance: r.importance,
      quality: r.quality,
      behind: behind(r),
    })),
    edges: relationships.map((r) => ({
      id: `ego:${r.personId}`,
      source: ME_ID,
      target: r.personId,
      kind: 'ego' as const,
      importance: r.importance,
      quality: r.quality,
      behind: behind(r),
    })),
  };
}

/** Shared visual rules, so every renderer encodes the data the same way. */
export const encode = {
  edgeWidth: (importance: Rating) => 0.75 + importance * 0.9,
  edgeOpacity: (behind: boolean) => (behind ? 0.35 : 0.9),
  nodeOpacity: (behind: boolean) => (behind ? 0.45 : 1),
  edgeColour: (e: GraphEdge, s: GraphStyle) =>
    s.colourByQuality && e.quality !== null ? s.colours.quality[e.quality] : s.colours.edge,
  initial: (label: string) => label.charAt(0).toUpperCase(),
  shortLabel: (label: string) => (label.length > 14 ? `${label.slice(0, 13)}…` : label),
};
