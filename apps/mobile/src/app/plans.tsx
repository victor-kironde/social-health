import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CONFIRM_WINDOW_DAYS, comingUp, planEveryText, planName, toConfirm, type PlannedDate } from '../data/plans';
import { useStore } from '../data/store';
import { localDate, shortDateLabel } from '../ui/calendar';
import { Button, Card, Label } from '../ui/components';
import { INTERACTION_LABELS } from '../ui/labels';
import { useTheme } from '../ui/theme';

/** Planned meetups: dates to confirm and what is coming up. */
export default function Plans() {
  const t = useTheme();
  const { plans, log, logInteraction, skipPlanDate } = useStore();
  const [busy, setBusy] = useState<string | null>(null);
  const today = localDate(Date.now());
  const names = new Map(log.people.map((p) => [p.id, p.displayName]));
  const pending = toConfirm(plans, log.interactions, today);
  const next = comingUp(plans, today);

  const when = (d: PlannedDate) =>
    d.daysAgo === 0 ? 'Today' : d.daysAgo === 1 ? 'Yesterday' : d.daysAgo === -1 ? 'Tomorrow' : shortDateLabel(d.date, today);

  async function act(d: PlannedDate, action: () => Promise<void>) {
    setBusy(`${d.plan.id}|${d.key}`);
    try {
      await action();
    } finally {
      setBusy(null);
    }
  }

  const confirm = (d: PlannedDate) =>
    act(d, () =>
      logInteraction({ participants: d.plan.withIds, type: d.plan.type, daysAgo: d.daysAgo, plan: { id: d.plan.id, date: d.key } }),
    );

  const edit = (d: PlannedDate) =>
    router.push({
      pathname: '/log',
      params: { people: d.plan.withIds.join(','), type: d.plan.type, daysAgo: String(d.daysAgo), plan: d.plan.id, planDate: d.key },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Button title="Plan a meetup" onPress={() => router.push({ pathname: '/plan/[id]', params: { id: 'new' } })} />
      <Card style={{ gap: 0 }}>
        <Label>To confirm</Label>
        {pending.length === 0 ? (
          <Text style={{ color: t.muted }}>Nothing to confirm.</Text>
        ) : (
          pending.map((d, i) => (
            <View key={`${d.plan.id}|${d.key}`} style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}>
              <Text style={{ color: t.text, fontSize: 16 }}>
                {planName(d.plan, names)} · {when(d)}
              </Text>
              <Text style={{ color: t.muted }}>Did it happen? {INTERACTION_LABELS[d.plan.type]}</Text>
              <View style={styles.actions}>
                <Button title="Yes" onPress={() => confirm(d)} disabled={busy !== null} />
                <Button title="Didn't happen" variant="secondary" onPress={() => act(d, () => skipPlanDate(d.plan.id, d.key))} disabled={busy !== null} />
                <Button title="Edit…" variant="secondary" onPress={() => edit(d)} disabled={busy !== null} />
              </View>
            </View>
          ))
        )}
        <Text style={[styles.hint, { color: t.muted }]}>
          Only confirmed dates count as catch-ups. “Edit…” lets you name who came and add notes. Dates older than{' '}
          {CONFIRM_WINDOW_DAYS} days stop asking.
        </Text>
      </Card>

      <Card style={{ gap: 0 }}>
        <Label>Coming up</Label>
        {next.length === 0 ? (
          <Text style={{ color: t.muted }}>No meetups planned yet.</Text>
        ) : (
          next.map((d, i) => (
            <Pressable
              key={d.plan.id}
              onPress={() => router.push({ pathname: '/plan/[id]', params: { id: d.plan.id } })}
              accessibilityRole="button"
              accessibilityHint="Edit this plan"
              style={[styles.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
            >
              <View style={styles.row}>
                <Text style={{ color: t.text, fontSize: 16, flexShrink: 1 }}>{planName(d.plan, names)}</Text>
                <Text style={{ color: t.text }}>{when(d)}</Text>
              </View>
              <Text style={{ color: t.muted }}>
                {INTERACTION_LABELS[d.plan.type]} {planEveryText(d.plan)}
                {d.plan.title ? ` · with ${planName({ withIds: d.plan.withIds }, names)}` : ''}
              </Text>
            </Pressable>
          ))
        )}
      </Card>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16 },
  item: { paddingVertical: 10, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  hint: { fontSize: 13, marginTop: 8, lineHeight: 18 },
});
