import { describe, expect, it } from 'vitest';
import { demoNetwork } from '../src/graph/demo';
import { ME_ID, buildGraph, encode } from '../src/graph/model';

describe('buildGraph', () => {
  const { relationships, names } = demoNetwork(12);
  const graph = buildGraph(relationships, names);

  it('has one node and one ego edge per relationship', () => {
    expect(graph.nodes).toHaveLength(12);
    expect(graph.edges).toHaveLength(12);
    for (const e of graph.edges) {
      expect(e.source).toBe(ME_ID);
      expect(graph.nodes.some((n) => n.id === e.target)).toBe(true);
    }
  });

  it('marks relationships behind their rhythm', () => {
    for (const r of relationships) {
      const node = graph.nodes.find((n) => n.id === r.personId)!;
      expect(node.behind).toBe(r.onRhythm !== null && r.onRhythm < 0.5);
    }
  });

  it('uses names, falling back to "?"', () => {
    expect(graph.nodes[0]!.label).toBe('Person 1');
    expect(buildGraph(relationships.slice(0, 1), new Map()).nodes[0]!.label).toBe('?');
  });
});

describe('encode', () => {
  it('makes more important edges thicker and behind ones fainter', () => {
    expect(encode.edgeWidth(5)).toBeGreaterThan(encode.edgeWidth(1));
    expect(encode.edgeOpacity(true)).toBeLessThan(encode.edgeOpacity(false));
    expect(encode.nodeOpacity(true)).toBeLessThan(encode.nodeOpacity(false));
  });

  it('shortens long labels', () => {
    expect(encode.shortLabel('Short')).toBe('Short');
    expect(encode.shortLabel('A very long name indeed')).toHaveLength(14);
  });
});
