import { resolveRelationships, type InteractionType } from '@sg/score-engine';
import { goBack } from '../ui/nav';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_GROUP_NAME, validateGroup } from '../data/groups';
import { MAX_BACKDATE_DAYS, MAX_NEW_PEOPLE, MAX_NOTE_LENGTH, validateInteraction } from '../data/interactions';
import { isGroup, onlyPeople } from '../data/kinds';
import { Stepper } from '../ui/RhythmPicker';
import { useModelConfig } from '../data/prefs';
import { useStore } from '../data/store';
import { Button, ChoiceChips, Label, MultiChoiceChips } from '../ui/components';
import { INTERACTION_LABELS, WHEN_OPTIONS } from '../ui/labels';
import { CalendarPicker } from '../ui/CalendarPicker';
import { dateDaysAgo, localDate, shortDateLabel } from '../ui/calendar';
import { useTheme } from '../ui/theme';

const TYPES = Object.keys(INTERACTION_LABELS) as InteractionType[];
/** The "Pick a date…" chip; any other value is days ago. */
const PICK_DATE = -1;
const NEW_GROUP = '__new_group__';

export default function LogContact() {
  const t = useTheme();
  const { log, logInteraction, groups, addGroup } = useStore();
  const config = useModelConfig();
  // `person` (one id) or `people` (comma-separated ids) preselect who was there.
  // From a planned meetup: its plan and date, how it was planned, and how many days ago it was.
  const {
    person,
    people: preselected,
    type: typeParam,
    daysAgo: daysAgoParam,
    plan: planId,
    planDate,
  } = useLocalSearchParams<{ person?: string; people?: string; type?: InteractionType; daysAgo?: string; plan?: string; planDate?: string }>();

  const [participants, setParticipants] = useState<string[]>(
    preselected ? preselected.split(',').filter(Boolean) : person ? [person] : [],
  );
  const [type, setType] = useState<InteractionType>(typeParam && typeParam in INTERACTION_LABELS ? typeParam : 'in_person');
  const [daysAgo, setDaysAgo] = useState(daysAgoParam ? Math.max(0, Number(daysAgoParam) || 0) : 0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [note, setNote] = useState('');
  const [newPeople, setNewPeople] = useState(0);
  const [newGroupName, setNewGroupName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { people, groupOptions } = useMemo(() => {
    const rels = resolveRelationships(log.relationshipEvents, config, Date.now());
    const retired = (id: string) => ['archived', 'in_memoriam'].includes(rels.get(id)?.state ?? 'active');
    const active = log.people.filter((p) => !retired(p.id)).sort((a, b) => a.displayName.localeCompare(b.displayName));
    return {
      people: onlyPeople(active).map((p) => ({ value: p.id, label: p.displayName })),
      groupOptions: active.filter(isGroup).map((p) => ({ value: p.id, label: p.displayName })),
    };
  }, [log.people, log.relationshipEvents, config]);
  // People in a chosen group come first, so ticking who was there is quick.
  const chosenGroups = groups.filter((g) => participants.includes(g.id));
  const memberIds = new Set(chosenGroups.flatMap((g) => g.members));
  const peopleOrdered = [...people.filter((p) => memberIds.has(p.value)), ...people.filter((p) => !memberIds.has(p.value))];

  async function createGroup() {
    const name = (newGroupName ?? '').trim();
    const invalid = validateGroup(name, groups);
    if (invalid) {
      setError(invalid);
      return;
    }
    const id = await addGroup(name, participants.filter((p) => !groups.some((g) => g.id === p)));
    setParticipants((prev) => [...prev, id]);
    setNewGroupName(null);
    setError(null);
  }

  async function save() {
    const input = {
      participants,
      type,
      daysAgo,
      note,
      ...(chosenGroups.length && newPeople ? { newPeople } : {}),
      ...(planId && planDate ? { plan: { id: planId, date: planDate } } : {}),
    };
    const invalid = validateInteraction(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await logInteraction(input);
      goBack();
    } catch (e) {
      setError(`Could not save: ${String(e)}`);
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View>
        <Label>With a group?</Label>
        <MultiChoiceChips
          options={[...groupOptions, { value: NEW_GROUP, label: '+ New group' }]}
          values={participants.filter((p) => groupOptions.some((g) => g.value === p))}
          onChange={(v) => {
            if (v.includes(NEW_GROUP)) {
              setNewGroupName('');
              return;
            }
            setParticipants([...participants.filter((p) => !groupOptions.some((g) => g.value === p)), ...v]);
            setError(null);
          }}
        />
        {newGroupName !== null && (
          <View style={styles.newGroup}>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="e.g. Patients, Team, Book club"
              placeholderTextColor={t.muted}
              autoFocus
              maxLength={MAX_GROUP_NAME}
              accessibilityLabel="New group name"
              style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card, flex: 1 }]}
            />
            <Button title="Add" variant="secondary" onPress={createGroup} />
          </View>
        )}
        {chosenGroups.length > 0 && (
          <View style={styles.newPeople}>
            <Text style={{ color: t.text, fontSize: 15, flex: 1 }}>Others there (not named)</Text>
            <Stepper value={newPeople} min={0} max={MAX_NEW_PEOPLE} onChange={setNewPeople} />
          </View>
        )}
        {chosenGroups.length > 0 && (
          <Text style={[styles.hint, { color: t.muted }]}>
            Only the number is kept. Tick anyone below who you know: they join the group.
          </Text>
        )}
      </View>

      <View>
        <Label>{chosenGroups.length ? 'Who was there?' : 'Who was it with?'}</Label>
        <MultiChoiceChips
          options={peopleOrdered}
          values={participants.filter((p) => people.some((x) => x.value === p))}
          onChange={(v) => {
            setParticipants([...participants.filter((p) => !people.some((x) => x.value === p)), ...v]);
            setError(null);
          }}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          {chosenGroups.length
            ? 'Choose everyone who was there. It counts as one catch-up with each of them, and with the group. Anyone named joins the group.'
            : 'Choose everyone who was there. It counts as one catch-up with each of them.'}
        </Text>
        {error && <Text style={{ color: t.danger, marginTop: 6 }}>{error}</Text>}
      </View>

      <View>
        <Label>How?</Label>
        <ChoiceChips options={TYPES.map((v) => ({ value: v, label: INTERACTION_LABELS[v] }))} value={type} onChange={setType} />
      </View>

      <View>
        <Label>When?</Label>
        <ChoiceChips
          options={[
            ...WHEN_OPTIONS,
            // A date picked from the calendar shows as its own chip.
            ...(WHEN_OPTIONS.some((o) => o.value === daysAgo)
              ? []
              : [{ value: daysAgo, label: shortDateLabel(dateDaysAgo(localDate(Date.now()), daysAgo), localDate(Date.now())) }]),
            { value: PICK_DATE, label: 'Pick a date…' },
          ]}
          value={daysAgo}
          onChange={(v) => (v === PICK_DATE ? setCalendarOpen(true) : setDaysAgo(v))}
        />
        <CalendarPicker
          visible={calendarOpen}
          daysAgo={daysAgo}
          maxDaysAgo={MAX_BACKDATE_DAYS}
          onPick={setDaysAgo}
          onClose={() => setCalendarOpen(false)}
        />
      </View>

      <View>
        <Label>Notes (optional)</Label>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="What did you talk about? How did it feel?"
          placeholderTextColor={t.muted}
          multiline
          maxLength={MAX_NOTE_LENGTH}
          accessibilityLabel="Notes"
          style={[styles.note, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        <Text style={[styles.hint, { color: t.muted }]}>A private journal for you. It never affects any score.</Text>
      </View>

      <Button title={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  hint: { fontSize: 13, marginTop: 6 },
  newGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  newPeople: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  note: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 96, fontSize: 15, textAlignVertical: 'top' },
});
