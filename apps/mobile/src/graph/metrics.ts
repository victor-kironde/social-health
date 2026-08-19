/**
 * Social-network-analysis measures for the user's ego network, computed on
 * the alter-alter graph (the people and the ties between them, without the
 * user, as is usual in ego-network analysis: including the ego would connect
 * everyone and hide the structure). Pure; covered by test/metrics.test.ts.
 *
 *  - degree / strength: number of ties, and their total weight
 *  - local clustering (Watts & Strogatz): share of a person's contacts who
 *    are tied to each other
 *  - betweenness (Freeman; computed with Brandes' algorithm): how often a
 *    person lies on shortest paths between others, i.e. bridges groups
 *  - communities: Louvain modularity optimisation (Blondel et al.), with a
 *    deterministic node order
 *  - effective size and efficiency (Burt, structural holes): how
 *    non-redundant the user's contacts are
 */

export interface MetricTie {
  a: string;
  b: string;
  weight: number;
}

export interface NodeMetrics {
  degree: number;
  strength: number;
  clustering: number;
  /** Normalised to [0, 1] by the maximum possible, (n - 1)(n - 2) / 2. */
  betweenness: number;
  /** Community index (0 = largest); isolated people each form their own. */
  group: number;
  /** Size of that community (1 = no ties). */
  groupSize: number;
  /** Distinct communities among this person's own and their contacts' groups; >= 2 = connects groups. */
  groupsTouched: number;
}

export interface NetworkMetrics {
  nodes: Map<string, NodeMetrics>;
  size: number;
  ties: number;
  /** Share of possible alter-alter ties present. */
  density: number;
  /** Burt's effective size: n - 2t / n (unweighted). */
  effectiveSize: number;
  /** effectiveSize / n. 1 = nobody knows each other; low = one tight circle. */
  efficiency: number;
  /** Communities with two or more people. */
  groups: number;
  /** People with no ties to anyone else in the network. */
  isolates: number;
  /** Newman modularity of the community split. */
  modularity: number;
}

type Adjacency = Map<string, Map<string, number>>;

function adjacency(ids: string[], ties: MetricTie[]): Adjacency {
  const adj: Adjacency = new Map(ids.map((id) => [id, new Map()]));
  for (const t of ties) {
    if (t.a === t.b || !adj.has(t.a) || !adj.has(t.b)) continue;
    adj.get(t.a)!.set(t.b, (adj.get(t.a)!.get(t.b) ?? 0) + t.weight);
    adj.get(t.b)!.set(t.a, (adj.get(t.b)!.get(t.a) ?? 0) + t.weight);
  }
  return adj;
}

export function localClustering(adj: Adjacency, id: string): number {
  const nbrs = [...(adj.get(id)?.keys() ?? [])];
  const k = nbrs.length;
  if (k < 2) return 0;
  let links = 0;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (adj.get(nbrs[i]!)!.has(nbrs[j]!)) links++;
  return links / ((k * (k - 1)) / 2);
}

/** Brandes (2001) betweenness on the unweighted graph, normalised to [0, 1]. */
export function betweenness(adj: Adjacency): Map<string, number> {
  const ids = [...adj.keys()].sort();
  const cb = new Map(ids.map((id) => [id, 0]));
  for (const s of ids) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>(ids.map((id) => [id, []]));
    const sigma = new Map(ids.map((id) => [id, 0]));
    const dist = new Map(ids.map((id) => [id, -1]));
    sigma.set(s, 1);
    dist.set(s, 0);
    const queue = [s];
    for (let qi = 0; qi < queue.length; qi++) {
      const v = queue[qi]!;
      stack.push(v);
      for (const w of [...adj.get(v)!.keys()].sort()) {
        if (dist.get(w)! < 0) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }
    const delta = new Map(ids.map((id) => [id, 0]));
    while (stack.length) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) delta.set(v, delta.get(v)! + (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!));
      if (w !== s) cb.set(w, cb.get(w)! + delta.get(w)!);
    }
  }
  // Each pair was counted from both ends in an undirected graph.
  const n = ids.length;
  const norm = n > 2 ? ((n - 1) * (n - 2)) / 2 : 1;
  return new Map(ids.map((id) => [id, cb.get(id)! / 2 / norm]));
}

/** Newman modularity Q of a partition on a weighted graph. */
export function modularity(adj: Adjacency, community: Map<string, number>): number {
  let m2 = 0; // 2m: sum of all weighted degrees
  const deg = new Map<string, number>();
  for (const [id, nbrs] of adj) {
    const d = [...nbrs.values()].reduce((a, w) => a + w, 0);
    deg.set(id, d);
    m2 += d;
  }
  if (m2 === 0) return 0;
  let q = 0;
  for (const [i, nbrs] of adj) {
    for (const [j, w] of nbrs) if (community.get(i) === community.get(j)) q += w;
  }
  const totals = new Map<number, number>();
  for (const [id, d] of deg) totals.set(community.get(id)!, (totals.get(community.get(id)!) ?? 0) + d);
  let expected = 0;
  for (const t of totals.values()) expected += t * t;
  return q / m2 - expected / (m2 * m2);
}

/**
 * Louvain community detection (Blondel et al., 2008): repeatedly move nodes
 * to the neighbouring community with the largest modularity gain, then
 * merge communities into single nodes and repeat until nothing improves.
 * Node order is sorted, so results are deterministic.
 */
export function louvain(adj: Adjacency): Map<string, number> {
  // Work on a weighted graph whose nodes are groups of original ids.
  let nodes = [...adj.keys()].sort().map((id) => [id]);
  let weights = new Map<number, Map<number, number>>();
  const index = new Map([...adj.keys()].sort().map((id, i) => [id, i]));
  nodes.forEach((_, i) => weights.set(i, new Map()));
  for (const [a, nbrs] of adj) for (const [b, w] of nbrs) weights.get(index.get(a)!)!.set(index.get(b)!, w);

  for (let level = 0; level < 20; level++) {
    const n = nodes.length;
    const k = Array.from({ length: n }, (_, i) => [...weights.get(i)!.values()].reduce((a, w) => a + w, 0));
    const m2 = k.reduce((a, b) => a + b, 0);
    if (m2 === 0) break;
    const comm = Array.from({ length: n }, (_, i) => i);
    const tot = [...k];
    let moved = true;
    let anyMove = false;
    for (let pass = 0; moved && pass < 50; pass++) {
      moved = false;
      for (let i = 0; i < n; i++) {
        const ci = comm[i]!;
        const linksTo = new Map<number, number>();
        for (const [j, w] of weights.get(i)!) if (j !== i) linksTo.set(comm[j]!, (linksTo.get(comm[j]!) ?? 0) + w);
        tot[ci]! -= k[i]!;
        let best = ci;
        let bestGain = (linksTo.get(ci) ?? 0) - (tot[ci]! * k[i]!) / m2;
        for (const [c, kin] of [...linksTo.entries()].sort((x, y) => x[0] - y[0])) {
          const gain = kin - (tot[c]! * k[i]!) / m2;
          if (gain > bestGain + 1e-12) {
            best = c;
            bestGain = gain;
          }
        }
        tot[best]! += k[i]!;
        if (best !== ci) {
          comm[i] = best;
          moved = true;
          anyMove = true;
        }
      }
    }
    if (!anyMove) break;
    // Aggregate: each community becomes one node.
    const ids = [...new Set(comm)].sort((a, b) => a - b);
    const remap = new Map(ids.map((c, i) => [c, i]));
    const next = ids.map(() => [] as string[]);
    nodes.forEach((members, i) => next[remap.get(comm[i]!)!]!.push(...members));
    const nextWeights = new Map<number, Map<number, number>>(ids.map((_, i) => [i, new Map()]));
    for (const [i, nbrs] of weights) {
      for (const [j, w] of nbrs) {
        const a = remap.get(comm[i]!)!;
        const b = remap.get(comm[j]!)!;
        nextWeights.get(a)!.set(b, (nextWeights.get(a)!.get(b) ?? 0) + w);
      }
    }
    nodes = next;
    weights = nextWeights;
  }

  // Number communities by size (largest first), then by first member, so labels are stable.
  const groups = nodes.map((members) => [...members].sort()).sort((a, b) => b.length - a.length || (a[0]! < b[0]! ? -1 : 1));
  const out = new Map<string, number>();
  groups.forEach((members, g) => members.forEach((id) => out.set(id, g)));
  return out;
}

export function networkMetrics(ids: string[], ties: MetricTie[]): NetworkMetrics {
  const adj = adjacency(ids, ties);
  const n = ids.length;
  const tieCount = [...adj.values()].reduce((a, nbrs) => a + nbrs.size, 0) / 2;
  const btw = betweenness(adj);
  const community = louvain(adj);
  const sizes = new Map<number, number>();
  for (const g of community.values()) sizes.set(g, (sizes.get(g) ?? 0) + 1);
  const nodes = new Map<string, NodeMetrics>();
  for (const id of ids) {
    const nbrs = adj.get(id)!;
    const group = community.get(id) ?? 0;
    nodes.set(id, {
      degree: nbrs.size,
      strength: [...nbrs.values()].reduce((a, w) => a + w, 0),
      clustering: localClustering(adj, id),
      betweenness: btw.get(id) ?? 0,
      group,
      groupSize: sizes.get(group) ?? 1,
      groupsTouched: new Set([group, ...[...nbrs.keys()].map((nb) => community.get(nb)!)]).size,
    });
  }
  const effectiveSize = n === 0 ? 0 : n - (2 * tieCount) / n;
  return {
    nodes,
    size: n,
    ties: tieCount,
    density: n < 2 ? 0 : tieCount / ((n * (n - 1)) / 2),
    effectiveSize,
    efficiency: n === 0 ? 0 : effectiveSize / n,
    groups: [...sizes.values()].filter((s) => s >= 2).length,
    isolates: [...nodes.values()].filter((m) => m.degree === 0).length,
    modularity: modularity(adj, community),
  };
}
