import { DEFAULT_CONFIG, computeScore, type RelationshipContribution } from '@sg/score-engine';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { draftFromSnapshot, editPersonEvents, validatePerson, type PersonDraft } from '../../data/people';
import { useStore } from '../../data/store';
import { Button, Card, Label } from '../../ui/components';
import { INTERACTION_LABELS, formatDate, lastContactText } from '../../ui/labels';
import { PersonFields } from '../../ui/PersonFields';
import { useTheme } from '../../ui/theme';

export default function PersonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const { log } = useStore();

  const person = log.people.find((p) => p.id === id);
  const contribution = useMemo(
    () => computeScore(log, DEFAULT_CONFIG, Date.now()).relationships.find((r) => r.personId === id),
    [log, id],
  );

  if (!person || !contribution) {
    return (
      <View style={styles.center}>
        <Text style={{ color: t.muted }}>This person could not be found.</Text>
      </View>
    );
  }
  return <PersonEditor personId={id} name={person.displayName} rel={contribution} />;
}

function PersonEditor({
  personId,
  name,
  rel,
}: {
  personId: string;
  name: string;
  rel: RelationshipContribution;
}) {
  const t = useTheme();
  const { log, updatePerson } = useStore();
  const [draft, setDraft] = useState<PersonDraft>(() => draftFromSnapshot(name, rel));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const before = { displayName: name, rel };
  const dirty = editPersonEvents(personId, before, draft, 0, () => '').length > 0;

  const names = useMemo(() => new Map(log.people.map((p) => [p.id, p.displayName])), [log.people]);
  const history = useMemo(
    () => log.interactions.filter((x) => x.participants.includes(personId)).sort((a, b) => b.ts - a.ts),
    [log.interactions, personId],
  );

  async function save() {
    const invalid = validatePerson({ ...draft, rhythm: draft.rhythm ?? undefined });
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await updatePerson(personId, before, draft);
      router.back();
    } catch (e) {
      setError(`Could not save: ${String(e)}`);
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name }} />

      <Card>
        <Text style={{ color: t.text, fontSize: 16 }}>{lastContactText(rel.lastContactAgeDays)}</Text>
        {rel.expectedIntervalDays !== null && (
          <Text style={{ color: t.muted }}>
            {rel.onRhythm !== null && rel.onRhythm >= 0.5 ? 'On rhythm' : 'Behind usual rhythm'} · hoping for contact
            every {Math.round(rel.expectedIntervalDays)} days
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          <Button
            title={`Log contact with ${name}`}
            onPress={() => router.push({ pathname: '/log', params: { person: personId } })}
          />
        </View>
      </Card>

      <Card style={{ gap: 0 }}>
        <Label>Contact history</Label>
        {history.length === 0 ? (
          <Text style={{ color: t.muted }}>Nothing logged yet.</Text>
        ) : (
          history.map((x, i) => {
            const others = x.participants.filter((p) => p !== personId).map((p) => names.get(p) ?? 'someone');
            return (
              <View
                key={x.id}
                style={[styles.historyRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
              >
                <Text style={{ color: t.text, flexShrink: 1 }}>
                  {INTERACTION_LABELS[x.type]}
                  {others.length > 0 ? ` with ${others.join(', ')}` : ''}
                </Text>
                <Text style={{ color: t.muted }}>{formatDate(x.ts)}</Text>
              </View>
            );
          })
        )}
      </Card>

      <PersonFields
        draft={draft}
        onChange={(d) => {
          setDraft(d);
          setError(null);
        }}
        nameError={error}
        showState
      />
      <Button title={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={!dirty || saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, gap: 20 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
});
