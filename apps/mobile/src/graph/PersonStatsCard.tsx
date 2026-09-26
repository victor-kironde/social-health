import type { RelationshipContribution } from '@sg/score-engine';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HEALTH_LABELS, IDEAL_COMPARISON_LABELS, bandLabelOf, compareToIdeal, personalHealth } from '../data/health';
import { photoUri } from '../data/photos';
import { importanceLabel, QUALITY_LABELS, frequencyText, lastContactText, typesLabel } from '../ui/labels';
import { useTheme } from '../ui/theme';
import { RECENT_WINDOW_DAYS, type PersonStats } from './personStats';

/** Compact, person-specific figures shown on the graph when someone is tapped. */
export function PersonStatsCard({
  rel,
  name,
  photo,
  stats,
  onOpen,
  onSetIdeal,
  onClose,
  group,
  translucent = false,
}: {
  rel: RelationshipContribution;
  name: string;
  photo?: string;
  stats: PersonStats;
  /** Opens the person's page: double tap on the card, or tap on their photo. */
  onOpen?: () => void;
  /** Opens the person's page at the ideal question (shown when no ideal is set). */
  onSetIdeal?: () => void;
  onClose: () => void;
  /** When this is a group: its member count and whether its members are collapsed into it. */
  group?: { members: number; collapsed: boolean; onToggle: () => void };
  /** See-through background, for floating over the graph. */
  translucent?: boolean;
}) {
  const t = useTheme();
  const { score, band: health } = personalHealth(rel);
  const ring = t.health[health];
  const rhythm =
    rel.expectedIntervalDays === null
      ? null
      : `${rel.onRhythm !== null && rel.onRhythm >= 0.5 ? 'On rhythm' : 'Behind'} · ${
          rel.frequency ? frequencyText(rel.frequency).toLowerCase() : `every ${Math.round(rel.expectedIntervalDays)} days`
        }`;
  const network = [
    `Seen with ${stats.knows} ${stats.knows === 1 ? 'person' : 'people'} here`,
    stats.group ? `group of ${stats.group.size}` : null,
    stats.bridge ? 'connects groups' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const idealText =
    rel.ideal === null
      ? "Don't mind (not scored)"
      : `${rel.ideal} · ${bandLabelOf(rel.ideal)} · ${IDEAL_COMPARISON_LABELS[compareToIdeal(score, rel.ideal)].toLowerCase()}`;
  const rows: [string, string][] = [
    ...(rel.idealSet ? ([['Ideal', idealText]] as [string, string][]) : []),
    ['Importance', importanceLabel(rel.importance)],
    ...(rel.together ? ([['Together', 'Lives or works with you']] as [string, string][]) : []),
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
    ...(group ? [] : ([['Network', network]] as [string, string][])),
  ];

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .enabled(!!onOpen)
    .runOnJS(true)
    .onEnd((_e, success) => {
      if (success) onOpen?.();
    });

  return (
    <GestureDetector gesture={doubleTap}>
      <View
        style={[styles.card, { backgroundColor: translucent ? `${t.card}B8` : t.card, borderColor: t.border }]}
        accessibilityLabel={`${name} details`}
      >
        <View style={styles.header}>
          <Pressable
            onPress={onOpen}
            disabled={!onOpen}
            hitSlop={6}
            accessibilityRole={onOpen ? 'button' : undefined}
            accessibilityLabel={onOpen ? `Open ${name}` : undefined}
          >
            {photo ? (
              <Image source={{ uri: photoUri(photo) }} style={[styles.avatar, { borderColor: ring }]} />
            ) : (
              <View style={[styles.avatar, { borderColor: ring, backgroundColor: t.bg }]}>
                <Text style={{ color: t.text, fontWeight: '700' }}>{name.charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </Pressable>
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
        {!rel.idealSet && (
        <View style={styles.row}>
          <Text style={[styles.key, { color: t.muted }]}>Ideal</Text>
          <Text style={[styles.value, { color: t.muted }]}>
            Not set (counted as 10)
            {onSetIdeal ? ' · ' : ''}
            {onSetIdeal && (
              <Text
                onPress={onSetIdeal}
                accessibilityRole="link"
                style={{ color: t.accent, fontWeight: '600', textDecorationLine: 'underline' }}
              >
                Set ideal
              </Text>
            )}
          </Text>
        </View>
      )}
      {group && (
        <View style={styles.row}>
          <Text style={[styles.key, { color: t.muted }]}>Members</Text>
          <Text style={[styles.value, { color: t.text }]}>
            {group.members}
            {group.members > 0 ? ' · ' : ''}
            {group.members > 0 && (
              <Text
                onPress={group.onToggle}
                accessibilityRole="button"
                style={{ color: t.accent, fontWeight: '600', textDecorationLine: 'underline' }}
              >
                {group.collapsed ? 'Expand' : 'Collapse'}
              </Text>
            )}
          </Text>
        </View>
      )}
      {rows.map(([k, v]) => (
          <View key={k} style={styles.row}>
            <Text style={[styles.key, { color: t.muted }]}>{k}</Text>
            <Text style={[styles.value, { color: t.text }]}>{v}</Text>
          </View>
        ))}
        {onOpen && (
          <Text style={[styles.hint, { color: t.muted }]}>Double-tap here or tap the photo to open {name.split(' ')[0]}</Text>
        )}
      </View>
    </GestureDetector>
  );
}

/** "6 · Drifting a little": a relationship's own score out of 10 and its health, in its colour. */
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
  hint: { fontSize: 10, marginTop: 4, textAlign: 'center' },
});
