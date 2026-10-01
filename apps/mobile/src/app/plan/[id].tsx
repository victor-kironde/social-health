import { resolveRelationships, type InteractionType } from '@sg/score-engine';
import { randomUUID } from 'expo-crypto';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { isGroup } from '../../data/kinds';
import {
  MAX_PLAN_EVERY,
  MAX_PLAN_START_DAYS,
  MAX_PLAN_TITLE,
  planEveryText,
  planRhythm,
  rhythmMatchesPlan,
  rhythmTarget,
  validatePlan,
  type Plan,
  type PlanUnit,
} from '../../data/plans';
import { MAX_NOTE_LENGTH } from '../../data/interactions';
import { useModelConfig } from '../../data/prefs';
import { useStore } from '../../data/store';
import { Calendar } from '../../ui/CalendarPicker';
import { dateDaysAgo, daysBetween, localDate, shortDateLabel } from '../../ui/calendar';
import { Button, ChoiceChips, Label, MultiChoiceChips } from '../../ui/components';
import { INTERACTION_LABELS, PRESET_TEXT, frequencyText } from '../../ui/labels';
import { goBack } from '../../ui/nav';
import { Stepper } from '../../ui/RhythmPicker';
import { useTheme } from '../../ui/theme';

const TYPES = Object.keys(INTERACTION_LABELS) as InteractionType[];
const UNITS: PlanUnit[] = ['day', 'week', 'month'];

/** Plan a meetup (id = "new") or edit one: who, how, when, and whether it repeats. */
export default function PlanEditor() {
  const t = useTheme();
  // `with`: comma-separated people or groups a new plan starts with (e.g. from their page).
  const { id, with: withParam } = useLocalSearchParams<{ id: string; with?: string }>();
  const { plans, log, savePlan, deletePlan, status } = useStore();
  const config = useModelConfig();
  const existing = id === 'new' ? undefined : plans.find((p) => p.id === id);
  const today = localDate(Date.now());

  const [title, setTitle] = useState(existing?.title ?? '');
  const [withIds, setWithIds] = useState<string[]>(existing?.withIds ?? (withParam ? withParam.split(',').filter(Boolean) : []));
  const [type, setType] = useState<InteractionType>(existing?.type ?? 'in_person');
  const [startAgo, setStartAgo] = useState(existing ? daysBetween(existing.start, today) : -1);
  const [repeat, setRepeat] = useState(existing?.repeat ?? false);
  const [every, setEvery] = useState(existing?.every ?? 1);
  const [unit, setUnit] = useState<PlanUnit>(existing?.unit ?? 'week');
  const [note, setNote] = useState(existing?.note ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const rels = useMemo(() => resolveRelationships(log.relationshipEvents, config, Date.now()), [log.relationshipEvents, config]);
  const { groupOptions, peopleOptions } = useMemo(() => {
    const active = log.people
      .filter((p) => !['archived', 'in_memoriam'].includes(rels.get(p.id)?.state ?? 'active'))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
    const opt = (p: { id: string; displayName: string }) => ({ value: p.id, label: p.displayName });
    return { groupOptions: active.filter(isGroup).map(opt), peopleOptions: active.filter((p) => !isGroup(p)).map(opt) };
  }, [log.people, rels]);

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

  const start = dateDaysAgo(today, startAgo);
  const draft: Plan = {
    id: existing?.id ?? randomUUID(),
    withIds,
    ...(title.trim() ? { title: title.trim() } : {}),
    ...(note.trim() ? { note: note.trim() } : {}),
    type,
    repeat,
    every,
    unit,
    start,
    skipped: existing?.skipped ?? [],
    setRhythm: existing?.setRhythm ?? false,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  // Only a repeating plan with one person or group can set a rhythm.
  const target = rhythmTarget(draft);
  const targetName = target ? log.people.find((p) => p.id === target)?.displayName : undefined;
  const rel = target ? rels.get(target) : undefined;
  const ownsRhythm = rel && (!rel.rhythmSet || (existing?.setRhythm && rhythmMatchesPlan(rel, existing)));
  const want = planRhythm({ every, unit });
  const wantText = 'rhythm' in want ? PRESET_TEXT[want.rhythm] : frequencyText(want.frequency);
  const setWho = (kind: 'group' | 'person', v: string[]) => {
    const keep = withIds.filter((x) => (kind === 'group' ? !groupOptions.some((g) => g.value === x) : groupOptions.some((g) => g.value === x)));
    setWithIds([...keep, ...v]);
    setError(null);
  };

  async function save() {
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
      <Stack.Screen options={{ title: existing ? 'Edit meetup' : 'Plan a meetup' }} />

      <View>
        <Label>What</Label>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="e.g. Lunch, Book club, Football"
          placeholderTextColor={t.muted}
          maxLength={MAX_PLAN_TITLE}
          accessibilityLabel="What"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
      </View>

      <View>
        <Label help="Choose any people and groups. Confirming the meetup later counts as one catch-up with each of them.">With</Label>
        {groupOptions.length > 0 && (
          <View style={{ marginBottom: 8 }}>
            <MultiChoiceChips options={groupOptions} values={withIds.filter((x) => groupOptions.some((g) => g.value === x))} onChange={(v) => setWho('group', v)} />
          </View>
        )}
        <MultiChoiceChips options={peopleOptions} values={withIds.filter((x) => peopleOptions.some((p) => p.value === x))} onChange={(v) => setWho('person', v)} />
      </View>

      <View>
        <Label>How?</Label>
        <ChoiceChips options={TYPES.map((v) => ({ value: v, label: INTERACTION_LABELS[v] }))} value={type} onChange={setType} />
      </View>

      <View>
        <Label help="After the date, the app asks whether the meetup happened. Only the ones you confirm count as catch-ups.">
          {repeat ? 'First date' : 'Date'}: {shortDateLabel(start, today)}
          {startAgo === 0 ? ' (today)' : startAgo === -1 ? ' (tomorrow)' : ''}
        </Label>
        <View style={{ maxWidth: 380 }}>
          <Calendar daysAgo={startAgo} maxDaysAgo={MAX_PLAN_START_DAYS} maxDaysAhead={MAX_PLAN_START_DAYS} onPick={setStartAgo} />
        </View>
      </View>

      <View style={styles.row}>
        <Text style={{ color: t.text, fontSize: 15, fontWeight: '600', flex: 1 }}>Repeats</Text>
        <Switch value={repeat} onValueChange={setRepeat} accessibilityLabel="Repeats" trackColor={{ true: t.accent, false: t.track }} />
      </View>
      {repeat && (
        <View style={{ marginTop: -8 }}>
          <View style={styles.row}>
            <Text style={{ color: t.text, fontSize: 15 }}>Every</Text>
            <Stepper value={every} min={1} max={MAX_PLAN_EVERY} onChange={setEvery} />
          </View>
          <View style={{ marginTop: 10 }}>
            <ChoiceChips options={UNITS.map((u) => ({ value: u, label: every === 1 ? u : `${u}s` }))} value={unit} onChange={setUnit} />
          </View>
          <Text style={[styles.hint, { color: t.muted }]}>
            {INTERACTION_LABELS[type]} {planEveryText({ repeat, every, unit })}, from {shortDateLabel(start, today)}
            {targetName && rel
              ? ownsRhythm
                ? `. Sets your catch-up rhythm with ${targetName} to “${wantText.toLowerCase()}”.`
                : `. Your catch-up rhythm with ${targetName} stays as you set it.`
              : ''}
          </Text>
        </View>
      )}

      <View>
        <Label help="Private to you: where, what to bring, anything to remember.">Notes</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Where, what to bring…"
          placeholderTextColor={t.muted}
          multiline
          maxLength={MAX_NOTE_LENGTH}
          accessibilityLabel="Notes"
          style={[styles.input, styles.note, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
      </View>

      {error && <Text style={{ color: t.danger }}>{error}</Text>}
      <Button title={saving ? 'Saving…' : existing ? 'Save changes' : 'Plan meetup'} onPress={save} disabled={saving} />
      {existing && <Button title="Delete plan" variant="secondary" onPress={confirmDelete} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hint: { fontSize: 13, marginTop: 8, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  note: { minHeight: 80, textAlignVertical: 'top' },
});
