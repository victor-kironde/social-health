import { resolveRelationships, type InteractionType } from '@sg/score-engine';
import { goBack } from '../ui/nav';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_BACKDATE_DAYS, MAX_NOTE_LENGTH, validateInteraction } from '../data/interactions';
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

export default function LogContact() {
  const t = useTheme();
  const { log, logInteraction } = useStore();
  const config = useModelConfig();
  // `person` (one id) or `people` (comma-separated ids) preselect who was there.
  const { person, people: preselected } = useLocalSearchParams<{ person?: string; people?: string }>();

  const [participants, setParticipants] = useState<string[]>(
    preselected ? preselected.split(',').filter(Boolean) : person ? [person] : [],
  );
  const [type, setType] = useState<InteractionType>('in_person');
  const [daysAgo, setDaysAgo] = useState(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const people = useMemo(() => {
    const rels = resolveRelationships(log.relationshipEvents, config, Date.now());
    const retired = (id: string) => ['archived', 'in_memoriam'].includes(rels.get(id)?.state ?? 'active');
    return log.people
      .filter((p) => !retired(p.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
      .map((p) => ({ value: p.id, label: p.displayName }));
  }, [log.people, log.relationshipEvents, config]);

  async function save() {
    const input = { participants, type, daysAgo, note };
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
        <Label>Who was it with?</Label>
        <MultiChoiceChips
          options={people}
          values={participants}
          onChange={(v) => {
            setParticipants(v);
            setError(null);
          }}
        />
        <Text style={[styles.hint, { color: t.muted }]}>Choose everyone who was there. A group counts as one catch-up.</Text>
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
  note: { borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 96, fontSize: 15, textAlignVertical: 'top' },
});
