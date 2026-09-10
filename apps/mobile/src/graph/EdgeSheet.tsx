import { DAY, type RelationshipContribution } from '@sg/score-engine';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Button } from '../ui/components';
import {
  IMPORTANCE_LABELS,
  QUALITY_LABELS,
  RHYTHM_LABELS,
  daysAgoText,
  lastContactText,
  typesLabel,
} from '../ui/labels';
import { useTheme } from '../ui/theme';
import type { NodeMetrics } from './metrics';
import type { GraphEdge } from './model';

/**
 * Summary card for a tapped edge: your relationship with someone (ego edge)
 * or what links two people (tie). Descriptive only, like the rest of the app.
 */
export function EdgeSheet({
  edge,
  relationships,
  metrics,
  names,
  now,
  animate,
  onClose,
  onOpenPerson,
  onLogContact,
  onHeight,
}: {
  edge: GraphEdge;
  relationships: Map<string, RelationshipContribution>;
  metrics?: Map<string, NodeMetrics>;
  names: Map<string, string>;
  now: number;
  animate: boolean;
  onClose: () => void;
  onOpenPerson: (id: string) => void;
  onLogContact: (ids: string[]) => void;
  /** Reports the sheet's height (plus its margin), so the graph can keep the selection above it. */
  onHeight?: (height: number) => void;
}) {
  const t = useTheme();
  const name = (id: string) => names.get(id) ?? 'Someone';

  let body: ReactNode;
  if (edge.kind === 'ego') {
    const r = relationships.get(edge.target);
    if (!r) return null;
    const rhythm =
      r.onRhythm === null ? 'No set rhythm' : r.onRhythm >= 0.5 ? 'On their usual rhythm' : 'Behind their usual rhythm';
    body = (
      <>
        <Text style={[styles.title, { color: t.text }]}>{name(r.personId)}</Text>
        <Text style={{ color: t.muted }}>
          {typesLabel(r.category, r.alsoCategories)} · {IMPORTANCE_LABELS[r.importance]} · {RHYTHM_LABELS[r.rhythm]}
        </Text>
        <Text style={[styles.line, { color: t.text }]}>
          {lastContactText(r.lastContactAgeDays)} · {rhythm}
        </Text>
        <Text style={{ color: t.muted }}>
          {r.quality === null ? 'Quality not rated' : `Currently: ${QUALITY_LABELS[r.quality].toLowerCase()}`}
        </Text>
        {metrics?.get(r.personId) && <Text style={{ color: t.muted }}>{networkPlace(metrics.get(r.personId)!)}</Text>}
        <View style={styles.actions}>
          <View style={styles.grow}>
            <Button title="Log a catch-up" onPress={() => onLogContact([r.personId])} />
          </View>
          <View style={styles.grow}>
            <Button title={`Open ${name(r.personId)}`} variant="secondary" onPress={() => onOpenPerson(r.personId)} />
          </View>
        </View>
      </>
    );
  } else {
    const a = name(edge.source);
    const b = name(edge.target);
    const days = (now - edge.lastTs) / DAY;
    body = (
      <>
        <Text style={[styles.title, { color: t.text }]}>
          {a} &amp; {b}
        </Text>
        <Text style={[styles.line, { color: t.text }]}>
          Together in {edge.count} {edge.count === 1 ? 'catch-up' : 'catch-ups'} · most recently {daysAgoText(days)}
        </Text>
        <Text style={{ color: t.muted }}>Inferred from catch-ups you logged with both of them. Only you can see this.</Text>
        <View style={styles.actions}>
          <View style={styles.grow}>
            <Button title="Catch up with both" onPress={() => onLogContact([edge.source, edge.target])} />
          </View>
        </View>
        <View style={styles.actions}>
          <View style={styles.grow}>
            <Button title={`Open ${a}`} variant="secondary" onPress={() => onOpenPerson(edge.source)} />
          </View>
          <View style={styles.grow}>
            <Button title={`Open ${b}`} variant="secondary" onPress={() => onOpenPerson(edge.target)} />
          </View>
        </View>
      </>
    );
  }

  return (
    <Animated.View
      entering={animate ? FadeInDown.duration(180) : undefined}
      onLayout={(e) => onHeight?.(e.nativeEvent.layout.height + 12)}
      style={[styles.sheet, { backgroundColor: t.card, borderColor: t.border }]}
    >
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={styles.close}>
        <Text style={{ color: t.muted, fontSize: 18 }}>✕</Text>
      </Pressable>
      {body}
    </Animated.View>
  );
}

/** Plain-language summary of where someone sits in the network of ties. */
function networkPlace(m: NodeMetrics): string {
  if (m.degree === 0) return 'Not seen with anyone else you know';
  const group = m.groupSize >= 2 ? `In a group of ${m.groupSize}` : 'Linked to others';
  const bridge = m.groupsTouched >= 2 ? ` · connects ${m.groupsTouched} groups` : '';
  return `${group} · seen with ${m.degree} ${m.degree === 1 ? 'person' : 'people'} you know${bridge}`;
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 4,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  close: { position: 'absolute', top: 10, right: 14, zIndex: 1 },
  title: { fontSize: 18, fontWeight: '700', marginRight: 28 },
  line: { marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  grow: { flex: 1 },
});
