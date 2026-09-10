import type { RelationshipContribution } from '@sg/score-engine';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { HEALTH_LABELS, personalHealth } from '../data/health';
import { photoUri } from '../data/photos';
import { IMPORTANCE_LABELS, QUALITY_LABELS, lastContactText, typesLabel } from '../ui/labels';
import { useTheme } from '../ui/theme';
import { RECENT_WINDOW_DAYS, type PersonStats } from './personStats';

/** Compact, person-specific figures shown on the graph when someone is tapped. */
export function PersonStatsCard({
  rel,
  name,
  photo,
  stats,
  onOpen,
  onLog,
  onClose,
  translucent = false,
}: {
  rel: RelationshipContribution;
  name: string;
  photo?: string;
  stats: PersonStats;
  onOpen?: () => void;
  onLog?: () => void;
  onClose: () => void;
  /** See-through background, for floating over the graph. */
  translucent?: boolean;
}) {
  const t = useTheme();
  const { score, band: health } = personalHealth(rel);
  const ring = t.health[health];
  const rhythm =
    rel.expectedIntervalDays === null
      ? null
      : `${rel.onRhythm !== null && rel.onRhythm >= 0.5 ? 'On rhythm' : 'Behind'} · every ${Math.round(rel.expectedIntervalDays)} days`;
  const network = [
    `Seen with ${stats.knows} ${stats.knows === 1 ? 'person' : 'people'} here`,
    stats.group ? `group of ${stats.group.size}` : null,
    stats.bridge ? 'connects groups' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const rows: [string, string][] = [
    ['Importance', IMPORTANCE_LABELS[rel.importance]],
    ['Last catch-up', lastContactText(rel.lastContactAgeDays).replace(/^Last catch-up /, '')],
    ...(rhythm ? ([['Rhythm', rhythm]] as [string, string][]) : []),
    [
      'Catch-up frequency',
      stats.frequencyRank === null ? 'No catch-ups yet' : `#${stats.frequencyRank} of ${stats.contacted} most in touch`,
    ],
    [`Catch-ups (${RECENT_WINDOW_DAYS} days)`, String(stats.loggedRecent)],
    ...(stats.callsRecent
      ? ([[`Calls (${RECENT_WINDOW_DAYS} days)`, `${stats.callsRecent.count} · ${stats.callsRecent.minutes} min`]] as [
          string,
          string,
        ][])
      : []),
    ['Quality', rel.quality === null ? 'Not rated' : QUALITY_LABELS[rel.quality]],
    ['Network', network],
  ];

  return (
    <View
      style={[styles.card, { backgroundColor: translucent ? `${t.card}B8` : t.card, borderColor: t.border }]} accessibilityLabel={`${name} details`}>
      <View style={styles.header}>
        {photo ? (
          <Image source={{ uri: photoUri(photo) }} style={[styles.avatar, { borderColor: ring }]} />
        ) : (
          <View style={[styles.avatar, { borderColor: ring, backgroundColor: t.bg }]}>
            <Text style={{ color: t.text, fontWeight: '700' }}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={{ color: t.muted, fontSize: 12 }} numberOfLines={1}>
            {typesLabel(rel.category, rel.alsoCategories)}
          </Text>
          <HealthPill score={score} label={HEALTH_LABELS[health]} colour={ring} />
        </View>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
          <Text style={{ color: t.muted, fontSize: 18 }}>×</Text>
        </Pressable>
      </View>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.row}>
          <Text style={[styles.key, { color: t.muted }]}>{k}</Text>
          <Text style={[styles.value, { color: t.text }]}>{v}</Text>
        </View>
      ))}
      {(onOpen || onLog) && (
        <View style={styles.actions}>
          {onLog && (
            <Pressable onPress={onLog} style={[styles.action, { borderColor: t.border }]} accessibilityRole="button">
              <Text style={{ color: t.text, fontSize: 13 }}>Catch up</Text>
            </Pressable>
          )}
          {onOpen && (
            <Pressable onPress={onOpen} style={[styles.action, { backgroundColor: t.accent }]} accessibilityRole="button">
              <Text style={{ color: t.onAccent, fontSize: 13, fontWeight: '600' }}>Open</Text>
            </Pressable>
          )}
        </View>
      )}
      <Text style={[styles.hint, { color: t.muted }]}>Double-tap a person to open them</Text>
    </View>
  );
}

/** "6 · Needs attention": a relationship's own score out of 10 and its health, in its colour. */
export function HealthPill({ score, label, colour, large = false }: { score: number; label: string; colour: string; large?: boolean }) {
  return (
    <View
      style={[styles.pill, { borderColor: colour }, large && styles.pillLarge]}
      accessible
      accessibilityLabel={`Relationship health ${score} out of 10, ${label}`}
    >
      <Text style={{ color: colour, fontWeight: '800', fontSize: large ? 16 : 12 }}>{score}</Text>
      <Text style={{ color: colour, fontSize: large ? 14 : 11, fontWeight: '600' }}>· {label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
    marginTop: 4,
  },
  pillLarge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, marginTop: 8 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  avatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 15, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  key: { fontSize: 12, flexShrink: 0 },
  value: { fontSize: 12, flexShrink: 1, textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  action: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: 'transparent' },
  hint: { fontSize: 10, marginTop: 4, textAlign: 'center' },
});
