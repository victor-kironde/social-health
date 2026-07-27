import type { InteractionType } from '@sg/score-engine';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { validateInteraction } from '../data/interactions';
import { useStore } from '../data/store';
import { Button, ChoiceChips, Label, MultiChoiceChips } from '../ui/components';
import { INTERACTION_LABELS, WHEN_OPTIONS } from '../ui/labels';
import { useTheme } from '../ui/theme';

const TYPES = Object.keys(INTERACTION_LABELS) as InteractionType[];

export default function LogContact() {
  const t = useTheme();
  const { log, logInteraction } = useStore();

  const [participants, setParticipants] = useState<string[]>([]);
  const [type, setType] = useState<InteractionType>('in_person');
  const [daysAgo, setDaysAgo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const people = useMemo(
    () =>
      [...log.people]
        .sort((a, b) => a.displayName.localeCompare(b.displayName))
        .map((p) => ({ value: p.id, label: p.displayName })),
    [log.people],
  );

  async function save() {
    const input = { participants, type, daysAgo };
    const invalid = validateInteraction(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await logInteraction(input);
      router.back();
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
        <Text style={[styles.hint, { color: t.muted }]}>Choose everyone who was there. A group counts as one contact.</Text>
        {error && <Text style={{ color: t.danger, marginTop: 6 }}>{error}</Text>}
      </View>

      <View>
        <Label>How?</Label>
        <ChoiceChips options={TYPES.map((v) => ({ value: v, label: INTERACTION_LABELS[v] }))} value={type} onChange={setType} />
      </View>

      <View>
        <Label>When?</Label>
        <ChoiceChips options={WHEN_OPTIONS} value={daysAgo} onChange={setDaysAgo} />
      </View>

      <Button title={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  hint: { fontSize: 13, marginTop: 6 },
});
