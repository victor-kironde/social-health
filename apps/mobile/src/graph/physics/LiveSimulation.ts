import {
  ME,
  createEgoSimulation,
  knownCount,
  toPositions,
  type LayoutInput,
  type LayoutLink,
  type PlacedPoint,
  type SimNode,
} from '../layout';

/**
 * Alpha the simulation is kept at while someone is being dragged: low, so people nearby make room
 * without the whole graph rearranging (what you move stays where you put it).
 */
const DRAG_ALPHA = 0.08;
/** Faster cooling after a release (~100 ticks from DRAG_ALPHA) than d3's default (~250). */
const RELEASE_DECAY = 0.055;
/** Gentle reheat for a remembered layout whose forces changed (new ties). */
const WARM_ALPHA = 0.3;

/**
 * A continuously running version of the ego layout, stepped one tick per
 * frame by the caller. Pure TypeScript (no React), so it can be tested and
 * driven from any loop. Uses d3's default cooling, which takes a few seconds
 * at 60 fps: that slow settle is what makes the graph feel alive.
 */
export class LiveSimulation {
  /** Person ids in drawing order; index i owns xy[2i], xy[2i + 1]. */
  readonly ids: string[];
  private readonly simulation;
  private readonly nodes: SimNode[];
  private readonly byId: Map<string, SimNode>;
  private dragging: string | null = null;
  /** An area being moved as a whole: its members and their offsets from the finger. */
  private group: { n: SimNode; dx: number; dy: number }[] | null = null;
  /** Ticks run so far (for instrumentation). */
  ticks = 0;

  constructor(
    inputs: LayoutInput[],
    opts: {
      previous?: Map<string, PlacedPoint>;
      seed?: number;
      links?: LayoutLink[];
      /** Relax even if every position is remembered (e.g. the ties changed since they were saved). */
      warm?: boolean;
      /** People the user moved: held exactly where they were put. */
      pinned?: Map<string, { x: number; y: number }>;
    } = {},
  ) {
    const { simulation, simNodes } = createEgoSimulation(inputs, opts);
    this.simulation = simulation;
    this.nodes = simNodes.filter((n) => n.id !== ME);
    this.ids = this.nodes.map((n) => n.id);
    this.byId = new Map(this.nodes.map((n) => [n.id, n]));
    for (const [id, p] of opts.pinned ?? []) {
      const n = this.byId.get(id);
      if (!n) continue;
      n.x = n.fx = p.x;
      n.y = n.fy = p.y;
    }

    // Start hotter the less we already know, so a fresh graph unfolds and a
    // cached one barely moves.
    const known = knownCount(inputs, opts.previous);
    const unknownShare = inputs.length ? 1 - known / inputs.length : 0;
    const atRest = known === inputs.length;
    simulation.alpha(atRest ? (opts.warm ? WARM_ALPHA : 0) : Math.max(0.1, unknownShare));
  }

  /** True while still settling or while a node is held. */
  get active(): boolean {
    return this.dragging !== null || this.group !== null || this.simulation.alpha() >= this.simulation.alphaMin();
  }

  step(ticks = 1): void {
    this.simulation.tick(ticks);
    this.ticks += ticks;
  }

  /** Step until settled (for reduced motion), cooling fast like the one-shot layout. */
  settle(maxTicks = 600): void {
    const decay = this.simulation.alphaDecay();
    this.simulation.alphaDecay(1 - Math.pow(0.001, 1 / 120));
    for (let i = 0; i < maxTicks && this.active; i++) this.simulation.tick();
    this.simulation.alphaDecay(decay);
  }

  /** Interleaved [x0, y0, x1, y1, ...] in `ids` order. */
  xy(): number[] {
    const out = new Array<number>(this.nodes.length * 2);
    this.nodes.forEach((n, i) => {
      out[2 * i] = n.x ?? 0;
      out[2 * i + 1] = n.y ?? 0;
    });
    return out;
  }

  dragStart(id: string, x: number, y: number): void {
    const n = this.byId.get(id);
    if (!n) return;
    this.dragging = id;
    n.fx = x;
    n.fy = y;
    this.simulation.alphaTarget(DRAG_ALPHA);
    if (this.simulation.alpha() < DRAG_ALPHA) this.simulation.alpha(DRAG_ALPHA);
  }

  dragMove(id: string, x: number, y: number): void {
    const n = this.byId.get(id);
    if (!n || this.dragging !== id) return;
    n.fx = x;
    n.fy = y;
  }

  /**
   * Release: the node stays where it was put (returned, for saving) and the rest of the graph
   * settles around it.
   */
  dragEnd(id: string): { x: number; y: number } | null {
    const n = this.byId.get(id);
    if (!n || this.dragging !== id) return null;
    this.dragging = null;
    this.simulation.alphaTarget(0).alphaDecay(RELEASE_DECAY);
    return n.fx != null && n.fy != null ? { x: n.fx, y: n.fy } : null;
  }

  /** Starts moving several people together (a whole area), keeping their arrangement. */
  groupStart(ids: string[], x: number, y: number): void {
    const nodes = ids.map((id) => this.byId.get(id)).filter((n): n is SimNode => n !== undefined);
    if (!nodes.length) return;
    this.group = nodes.map((n) => {
      n.fx = n.x ?? 0;
      n.fy = n.y ?? 0;
      return { n, dx: (n.x ?? 0) - x, dy: (n.y ?? 0) - y };
    });
    this.simulation.alphaTarget(DRAG_ALPHA);
    if (this.simulation.alpha() < DRAG_ALPHA) this.simulation.alpha(DRAG_ALPHA);
  }

  groupMove(x: number, y: number): void {
    for (const g of this.group ?? []) {
      g.n.fx = x + g.dx;
      g.n.fy = y + g.dy;
    }
  }

  /** Release: everyone moved stays where they were put (returned, for saving). */
  groupEnd(): Map<string, { x: number; y: number }> {
    const out = new Map<string, { x: number; y: number }>();
    for (const g of this.group ?? []) if (g.n.fx != null && g.n.fy != null) out.set(g.n.id, { x: g.n.fx, y: g.n.fy });
    this.group = null;
    this.simulation.alphaTarget(0).alphaDecay(RELEASE_DECAY);
    return out;
  }

  /**
   * Ends any drag, settles whatever motion remains, and returns the final
   * positions: for saving when the view closes before the graph came to rest.
   */
  flush(): Map<string, PlacedPoint> {
    if (this.dragging) this.dragEnd(this.dragging);
    if (this.group) this.groupEnd();
    if (this.active) this.settle();
    return this.positions();
  }

  positions(): Map<string, PlacedPoint> {
    return toPositions(this.nodes);
  }
}
