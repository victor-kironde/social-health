import type { Rating, RelationshipContribution } from '@sg/score-engine';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { HEALTH_LABELS, personalHealth } from '../data/health';
import { photoUri } from '../data/photos';
import { QUALITY_LABELS, frequencyText, lastContactText, typesLabel } from '../ui/labels';
import { useTheme } from '../ui/theme';
import { RECENT_WINDOW_DAYS, type PersonStats } from './personStats';

/** A 0–1 "how well is this going" value as a band on the health scale (1 red … 5 green). */
export function scaleBand(x: number): Rating {
  return x >= 0.85 ? 5 : x >= 0.65 ? 4 : x >= 0.45 ? 3 : x >= 0.25 ? 2 : 1;
}

interface Row {
  key: string;
  value: string;
  /** Colour of the value; muted when undefined. */
  colour?: string;
  /** Show the value as a small outlined badge (e.g. "6/10"). */
  badge?: boolean;
}

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
  const interval = rel.expectedIntervalDays ?? 30;
  const rhythmText =
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
  // How overdue the last catch-up is, against the rhythm: on time is green, three rhythms late is grey.
  const age = rel.lastContactAgeDays;
  const overdue = age === null ? Infinity : age / interval;
  const lastColour = overdue <= 1 ? t.health[5] : overdue <= 1.5 ? t.health[4] : overdue <= 2 ? t.health[3] : overdue <= 3 ? t.health[2] : t.health.lost;
  // Catch-ups in the recent window against how many the rhythm hopes for.
  const hoped = Math.max(1, RECENT_WINDOW_DAYS / interval);
  const countColour = (n: number) => t.health[scaleBand(Math.min(1, n / hoped))];
  // Importance runs from faint to full accent; it is a choice, not a status.
  const importanceColour = `${t.accent}${Math.round(110 + (145 * (rel.importance - 1)) / 9).toString(16).padStart(2, '0')}`;

  const rows: Row[] = [
    ...(rel.idealSet
      ? [
          rel.ideal === null
            ? { key: 'Ideal', value: "Don't mind" }
            : {
                key: 'Ideal',
                value: `${rel.ideal}/10`,
                colour: t.health[scaleBand(1 - Math.abs(score - rel.ideal) / 9)],
                badge: true,
              },
        ]
      : []),
    { key: 'Importance', value: `${rel.importance}/10`, colour: importanceColour, badge: true },
    ...(rel.together ? [{ key: 'Together', value: 'Lives or works with you', colour: t.accent }] : []),
    {
      key: 'Last catch-up',
      value: lastContactText(rel.lastContactAgeDays).replace(/^Last catch-up /, ''),
      colour: lastColour,
    },
    ...(rhythmText ? [{ key: 'Rhythm', value: rhythmText, colour: t.health[scaleBand(rel.onRhythm ?? 0)] }] : []),
    {
      key: 'Catch-up frequency',
      value: stats.frequencyRank === null ? 'No catch-ups yet' : `#${stats.frequencyRank} of ${stats.contacted} most in touch`,
      colour:
        stats.frequencyRank === null
          ? t.health.lost
          : t.health[scaleBand(1 - (stats.frequencyRank - 1) / Math.max(1, stats.contacted - 1))],
    },
    { key: `Catch-ups (${RECENT_WINDOW_DAYS} days)`, value: String(stats.loggedRecent), colour: countColour(stats.loggedRecent) },
    ...(stats.callsRecent
      ? [
          {
            key: `Calls (${RECENT_WINDOW_DAYS} days)`,
            value: `${stats.callsRecent.count} · ${stats.callsRecent.minutes} min`,
            colour: countColour(stats.callsRecent.count),
          },
        ]
      : []),
    {
      key: 'Quality',
      value: rel.quality === null ? 'Not rated' : QUALITY_LABELS[rel.quality],
      colour: rel.quality === null ? undefined : t.health[rel.quality],
    },
    ...(group ? [] : [{ key: 'Network', value: network, colour: t.text }]),
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
      {rows.map((r) => (
          <View key={r.key} style={styles.row}>
            <Text style={[styles.key, { color: t.muted }]}>{r.key}</Text>
            {r.badge ? (
              <View style={[styles.badge, { borderColor: r.colour ?? t.muted }]}>
                <Text style={{ color: r.colour ?? t.muted, fontSize: 12, fontWeight: '800' }}>{r.value}</Text>
              </View>
            ) : (
              <Text style={[styles.value, { color: r.colour ?? t.muted, fontWeight: r.colour ? '600' : '400' }]}>{r.value}</Text>
            )}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  key: { fontSize: 12, flexShrink: 0 },
  value: { fontSize: 12, flexShrink: 1, textAlign: 'right' },
  hint: { fontSize: 10, marginTop: 4, textAlign: 'center' },
  badge: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 0 },
});
