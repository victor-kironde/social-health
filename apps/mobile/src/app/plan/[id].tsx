import { resolveRelationships, type InteractionType } from '@sg/score-engine';
import { randomUUID } from 'expo-crypto';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { isGroup } from '../../data/kinds';
import {
  MAX_PLAN_EVERY,
  MAX_PLAN_START_DAYS,
  planEveryText,
  planRhythm,
  rhythmMatchesPlan,
  validatePlan,
  type Plan,
  type PlanUnit,
} from '../../data/plans';
import { useModelConfig } from '../../data/prefs';
import { useStore } from '../../data/store';
import { CalendarPicker } from '../../ui/CalendarPicker';
import { dateDaysAgo, daysBetween, localDate, shortDateLabel } from '../../ui/calendar';
import { Button, ChoiceChips, Label } from '../../ui/components';
import { INTERACTION_LABELS, PRESET_TEXT, frequencyText } from '../../ui/labels';
import { goBack } from '../../ui/nav';
import { Stepper } from '../../ui/RhythmPicker';
import { useTheme } from '../../ui/theme';

const TYPES = Object.keys(INTERACTION_LABELS) as InteractionType[];
const UNITS: PlanUnit[] = ['day', 'week', 'month'];
const PICK_DATE = 'pick';

/** Create (id = "new") or edit a planned regular meetup with a person or group. */
export default function PlanEditor() {
  const t = useTheme();
  // `with`: who a new plan is with (e.g. from their page).
  const { id, with: withParam } = useLocalSearchParams<{ id: string; with?: string }>();
  const { plans, log, savePlan, deletePlan, status } = useStore();
  const config = useModelConfig();
  const existing = id === 'new' ? undefined : plans.find((p) => p.id === id);
  const today = localDate(Date.now());

  const [withId, setWithId] = useState(existing?.withId ?? withParam ?? '');
  const [type, setType] = useState<InteractionType>(existing?.type ?? 'in_person');
  const [every, setEvery] = useState(existing?.every ?? 1);
  const [unit, setUnit] = useState<PlanUnit>(existing?.unit ?? 'week');
  const [startAgo, setStartAgo] = useState(existing ? daysBetween(existing.start, today) : 0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rels = useMemo(() => resolveRelationships(log.relationshipEvents, config, Date.now()), [log.relationshipEvents, config]);
  const options = useMemo(
    () =>
      log.people
        .filter((p) => !['archived', 'in_memoriam'].includes(rels.get(p.id)?.state ?? 'active'))
        .sort((a, b) => Number(isGroup(b)) - Number(isGroup(a)) || a.displayName.localeCompare(b.displayName))
        .map((p) => ({ value: p.id, label: isGroup(p) ? `${p.displayName} (group)` : p.displayName })),
    [log.people, rels],
  );

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }
  if (id !== 'new' && !existing) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.muted }}>This plan could not be found.</Text>
      </View>
    );
  }

  const name = log.people.find((p) => p.id === withId)?.displayName;
  const start = dateDaysAgo(today, startAgo);
  const rel = rels.get(withId);
  const ownsRhythm = rel && (!rel.rhythmSet || (existing?.setRhythm && rhythmMatchesPlan(rel, existing)));
  const want = planRhythm({ every, unit });
  const wantText = 'rhythm' in want ? PRESET_TEXT[want.rhythm] : frequencyText(want.frequency);

  async function save() {
    const draft: Plan = {
      id: existing?.id ?? randomUUID(),
      withId,
      type,
      every,
      unit,
      start,
      skipped: existing?.skipped ?? [],
      setRhythm: existing?.setRhythm ?? false,
      createdAt: existing?.createdAt ?? Date.now(),
    };
    const invalid = validatePlan(draft, today);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await savePlan(draft, config);
      goBack();
    } catch (e) {
      setError(`Could not save: ${String(e)}`);
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert('Delete this plan?', 'Catch-ups you already confirmed from it are kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deletePlan(existing.id);
          goBack();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: existing ? 'Edit plan' : 'Plan a regular meetup' }} />

      <View>
        <Label>With</Label>
        <ChoiceChips options={options} value={withId} onChange={(v) => (setWithId(v), setError(null))} />
      </View>

      <View>
        <Label>How?</Label>
        <ChoiceChips options={TYPES.map((v) => ({ value: v, label: INTERACTION_LABELS[v] }))} value={type} onChange={setType} />
      </View>

      <View>
        <Label>How often?</Label>
        <View style={styles.row}>
          <Text style={{ color: t.text, fontSize: 15 }}>Every</Text>
          <Stepper value={every} min={1} max={MAX_PLAN_EVERY} onChange={setEvery} />
        </View>
        <View style={{ marginTop: 10 }}>
          <ChoiceChips
            options={UNITS.map((u) => ({ value: u, label: every === 1 ? u : `${u}s` }))}
            value={unit}
            onChange={setUnit}
          />
        </View>
      </View>

      <View>
        <Label>{startAgo > 0 ? 'Started' : 'Starting'}</Label>
        <ChoiceChips
          options={[
            { value: '0', label: 'Today' },
            ...(startAgo === 0 ? [] : [{ value: String(startAgo), label: shortDateLabel(start, today) }]),
            { value: PICK_DATE, label: 'Pick a date…' },
          ]}
          value={String(startAgo)}
          onChange={(v) => (v === PICK_DATE ? setCalendarOpen(true) : setStartAgo(Number(v)))}
        />
        <CalendarPicker
          visible={calendarOpen}
          daysAgo={startAgo}
          maxDaysAgo={MAX_PLAN_START_DAYS}
          maxDaysAhead={MAX_PLAN_START_DAYS}
          onPick={setStartAgo}
          onClose={() => setCalendarOpen(false)}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          {INTERACTION_LABELS[type]} {planEveryText({ every, unit })}, from {shortDateLabel(start, today)}. After each date, the app
          asks whether it happened; only the ones you confirm count as catch-ups.
        </Text>
      </View>

      {name && rel && (
        <Text style={[styles.hint, { color: t.muted, marginTop: -8 }]}>
          {ownsRhythm
            ? `Sets your catch-up rhythm with ${name} to “${wantText.toLowerCase()}”.`
            : `Your catch-up rhythm with ${name} stays as you set it.`}
        </Text>
      )}

      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button title={saving ? 'Saving…' : 'Save plan'} onPress={save} disabled={saving} />
      {existing && <Button title="Delete plan" variant="secondary" onPress={confirmDelete} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hint: { fontSize: 13, marginTop: 6, lineHeight: 18 },
});
