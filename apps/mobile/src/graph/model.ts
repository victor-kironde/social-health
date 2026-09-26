import type { Category, Rating, RelationshipContribution } from '@sg/score-engine';
import { relationshipHealth, type HealthBand } from '../data/health';
import type { ComponentType } from 'react';
import type { DerivedValue, SharedValue } from 'react-native-reanimated';
import type { EdgeRouting } from './geometry';
import { NODE_RADIUS, type Point } from './layout';
import type { NodeMetrics } from './metrics';
import type { Tie } from './ties';

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
  /** Every relationship type, primary first. */
  categories: Category[];
  /** Which shaded areas this person sits in: their types (default) or their groups. */
  areas?: string[];
  /** 1–10. */
  importance: number;
  quality: Rating | null;
  /** Drawn radius in graph units (sized by contact frequency, or uniform). */
  radius: number;
  /** Their photo (base64 JPEG, square), drawn inside the circle instead of the initial. */
  photo?: string;
  /** Behind their usual rhythm: drawn slightly faded. */
  behind: boolean;
  /** How the relationship is doing (colour), or 'lost' (grey, faint, further out). */
  health: HealthBand;
  /** In touch within RECENT_DAYS: live renderers give these a gentle pulse. */
  recent: boolean;
  /** Community from the tie graph (metrics.ts), or null for people with no ties. */
  group: number | null;
  /** Ties reach into another group: drawn with an extra outer ring. */
  bridge: boolean;
  /** A group (a relationship with a group as a whole), drawn as a rounded square. */
  isGroup?: boolean;
  /** For a group: how many members it has. */
  memberCount?: number;
  /** For a group: its members are hidden (collapsed into it). */
  collapsed?: boolean;
}

export const RECENT_DAYS = 7;

/** You to a person: encodes the relationship itself. */
export interface EgoEdge {
  id: string;
  kind: 'ego';
  source: typeof ME_ID;
  target: string;
  /** 1–10. */
  importance: number;
  quality: Rating | null;
  behind: boolean;
  health: HealthBand;
}

/** Person to person, inferred from contacts logged with both (see ties.ts). */
export interface TieEdge {
  id: string;
  kind: 'tie';
  /** A group-to-member link rather than an inferred tie between two people. */
  member?: boolean;
  source: string;
  target: string;
  weight: number;
  count: number;
  lastTs: number;
}

export type GraphEdge = EgoEdge | TieEdge;

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
  health: Record<HealthBand, string>;
  /** Categorical palette for communities, cycled. */
  groups: string[];
}

export interface GraphStyle {
  colours: GraphColours;
  showLabels: boolean;
  /** Edge to highlight (tapped), if any. */
  selectedEdgeId?: string | null;
  /** Person to highlight (tapped), if any. */
  selectedNodeId?: string | null;
  /** How edges are routed; defaults to right-angled ('orthogonal'). */
  routing?: EdgeRouting;
  /**
   * What colours each person's ring and their line to you: relationship health (default),
   * relationship type, or group.
   */
  colourBy?: 'health' | 'category' | 'group';
  /** Shaded background areas per relationship type (overlapping for people with several). */
  showSets?: boolean;
  /** Lines from you to each person; default true. */
  showEgoEdges?: boolean;
  /** Lines between people seen together; default true. */
  showTies?: boolean;
  /** Captions for the tiers arrangement: text baseline at (x, y), left-aligned. */
  rows?: { x: number; y: number; label: string }[];
  /** Members of a set further apart than this (graph units) are drawn as separate patches. */
  setMaxLink?: number;
  /** Display names of relationship types, for labelling sets. */
  categoryNames?: Record<Category, string>;
  /**
   * When the areas are not relationship types (e.g. your groups): their order, names and own
   * colours (used when colouring by type). Nodes then list their keys in `areas`.
   */
  areas?: { order: string[]; names: Record<string, string>; colours: Record<string, string> };
}

/** Pan/zoom, updated on the UI thread by gestures. Renderers read, never write. */
export interface ViewValues {
  tx: SharedValue<number>;
  ty: SharedValue<number>;
  scale: SharedValue<number>;
  /** Pixels per graph unit at scale 1, eased towards the `fit` prop when it changes. */
  fit: SharedValue<number>;
}

/** Positions that change every frame (live physics), readable on the UI thread. */
export interface LivePositions {
  /** Node ids; index i owns xy[2i], xy[2i + 1]. */
  ids: string[];
  /** Interleaved graph coordinates [x0, y0, x1, y1, ...]. */
  xy: DerivedValue<number[]>;
}

/**
 * The contract every renderer implements. Graph (0, 0) must be drawn at the
 * centre of `size`, a graph point p at  centre + (tx, ty) + scale * fit * p,
 * which is what screenToGraph() inverts for hit testing. Renderers should use
 * the animated `view.fit`; static ones may use the `fit` number instead (the
 * view then jumps rather than eases when the fit changes).
 */
export interface GraphRendererProps {
  data: GraphData;
  positions: Map<string, Point>;
  size: { width: number; height: number };
  /** Target pixels per graph unit at scale 1 (see `view.fit` for the animated value). */
  fit: number;
  view: ViewValues;
  style: GraphStyle;
  /** Called once the renderer has committed a new drawing (for timing). */
  onRendered?: () => void;
  /** Present when positions are live; live renderers draw from these instead of `positions`. */
  live?: LivePositions;
  /** Animation phase in [0, 1), looping; 0 and static when motion is reduced. */
  pulse?: SharedValue<number>;
}

export type GraphRenderer = ComponentType<GraphRendererProps>;

/** Build the drawable graph from scored relationships. Pure; no drawing concerns. */
export function buildGraph(
  relationships: RelationshipContribution[],
  names: Map<string, string>,
  ties: Tie[] = [],
  metrics?: Map<string, NodeMetrics>,
  radii?: Map<string, number>,
  photos?: Map<string, string>,
): GraphData {
  const behind = (r: RelationshipContribution) => r.onRhythm !== null && r.onRhythm < 0.5;
  const shown = new Set(relationships.map((r) => r.personId));
  const egoEdges: EgoEdge[] = relationships.map((r) => ({
    id: `ego:${r.personId}`,
    kind: 'ego',
    source: ME_ID,
    target: r.personId,
    importance: r.importance,
    quality: r.quality,
    behind: behind(r),
    health: relationshipHealth(r),
  }));
  // Ties only between people currently shown (filters hide both ends' links).
  const tieEdges: TieEdge[] = ties
    .filter((t) => shown.has(t.a) && shown.has(t.b))
    .map((t) => ({ id: `tie:${t.a}|${t.b}`, kind: 'tie', source: t.a, target: t.b, weight: t.weight, count: t.count, lastTs: t.lastTs }));
  return {
    nodes: relationships.map((r) => ({
      id: r.personId,
      label: names.get(r.personId) ?? '?',
      category: r.category,
      categories: [r.category, ...r.alsoCategories],
      importance: r.importance,
      quality: r.quality,
      radius: radii?.get(r.personId) ?? NODE_RADIUS,
      health: relationshipHealth(r),
      ...(photos?.has(r.personId) ? { photo: photos.get(r.personId)! } : {}),
      behind: behind(r),
      recent: !behind(r) && r.lastContactAgeDays !== null && r.lastContactAgeDays <= RECENT_DAYS,
      group: (metrics?.get(r.personId)?.groupSize ?? 1) >= 2 ? metrics!.get(r.personId)!.group : null,
      bridge: (metrics?.get(r.personId)?.groupsTouched ?? 1) >= 2,
    })),
    // Ties first so ego edges (the user's own relationships) draw on top.
    edges: [...tieEdges, ...egoEdges],
  };
}

/** How to draw one edge; every renderer uses this so they agree. */
export interface EdgeStroke {
  colour: string;
  width: number;
  opacity: number;
}

export function edgeStroke(e: GraphEdge, s: GraphStyle): EdgeStroke {
  const selected = s.selectedEdgeId === e.id;
  if (e.kind === 'ego') {
    return {
      colour: selected ? s.colours.accent : encode.edgeColour(e, s),
      width: encode.edgeWidth(e.importance) + (selected ? encode.selectedWidthBoost : 0),
      opacity: selected ? 1 : encode.edgeOpacity(e),
    };
  }
  if (e.member) {
    // Group to member: a light line in the accent colour, distinct from inferred ties.
    return { colour: selected ? s.colours.accent : s.colours.accent, width: 1.2, opacity: selected ? 1 : 0.35 };
  }
  // Weights are snapped to a few bands so renderers can batch ties into one path per band.
  const w = tieBand(e.weight);
  return {
    colour: selected ? s.colours.accent : s.colours.muted,
    width: encode.tieWidth(w) + (selected ? encode.selectedWidthBoost : 0),
    opacity: selected ? 1 : encode.tieOpacity(w),
  };
}

/** Representative weight for a tie's visual band (weak, light, firm, strong). */
export function tieBand(weight: number): number {
  if (weight < 0.5) return 0.35;
  if (weight < 1.5) return 1;
  if (weight < 3) return 2;
  return 3;
}

/** Shared visual rules, so every renderer encodes the data the same way. */
export const encode = {
  /** Importance 1–10: thicker for more important (same range as the old 1–5 scale). */
  edgeWidth: (importance: number) => 0.75 + importance * 0.45,
  /** Lost touch: faint; behind rhythm: a little faded. */
  edgeOpacity: (e: { behind: boolean; health: HealthBand }) => (e.health === 'lost' ? 0.25 : e.behind ? 0.6 : 0.9),
  nodeOpacity: (n: { behind: boolean; health: HealthBand }) => (n.health === 'lost' ? 0.38 : n.behind ? 0.8 : 1),
  edgeColour: (e: EgoEdge, s: GraphStyle) =>
    (s.colourBy ?? 'health') === 'health' ? s.colours.health[e.health] : s.colours.edge,
  /** Ties are secondary context: thin, muted, firmer when stronger. */
  tieWidth: (weight: number) => 0.8 + 1.4 * Math.min(1, weight / 3),
  tieOpacity: (weight: number) => 0.25 + 0.35 * Math.min(1, weight / 3),
  selectedWidthBoost: 3,
  /** Ring colour: relationship health, type, or group (grey when they have no ties). */
  ringColour: (n: GraphNode, s: GraphStyle) => {
    const by = s.colourBy ?? 'health';
    if (by === 'health') return s.colours.health[n.health];
    if (by === 'group') return n.group === null ? s.colours.edge : s.colours.groups[n.group % s.colours.groups.length]!;
    return s.colours.category[n.category];
  },
  initial: (label: string) => label.charAt(0).toUpperCase(),
  shortLabel: (label: string) => (label.length > 14 ? `${label.slice(0, 13)}…` : label),
};
