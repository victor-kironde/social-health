import { DEFAULT_CONFIG, computeScore, type RelationshipContribution } from '@sg/score-engine';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { relationshipHealth } from '../../data/health';
import { pickPersonPhoto, photoUri } from '../../data/photos';
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
  const { log, updatePerson, deletePerson, photos, setPhoto } = useStore();
  const photo = photos.get(personId);
  const [photoBusy, setPhotoBusy] = useState(false);
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

  async function choosePhoto() {
    setPhotoBusy(true);
    try {
      const jpeg = await pickPersonPhoto();
      if (jpeg) await setPhoto(personId, jpeg);
    } catch (e) {
      Alert.alert('Could not use that photo', String(e));
    } finally {
      setPhotoBusy(false);
    }
  }

  function confirmRemovePhoto() {
    Alert.alert('Remove photo?', `${name} will be shown with their initial again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setPhoto(personId, null).catch(() => undefined) },
    ]);
  }

  function confirmDelete() {
    Alert.alert(`Delete ${name}?`, 'Everything recorded about them will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setSaving(true);
          try {
            await deletePerson(personId);
            router.back();
          } catch (e) {
            setError(`Could not delete: ${String(e)}`);
            setSaving(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: name }} />

      <View style={styles.photoRow}>
        <Pressable onPress={choosePhoto} disabled={photoBusy} accessibilityRole="button" accessibilityLabel={photo ? 'Change photo' : 'Add photo'}>
          {photo ? (
            <Image source={{ uri: photoUri(photo) }} style={[styles.photo, { borderColor: t.health[relationshipHealth(rel)] }]} />
          ) : (
            <View style={[styles.photo, { borderColor: t.health[relationshipHealth(rel)], backgroundColor: t.card }]}>
              <Text style={{ color: t.text, fontSize: 32, fontWeight: '700' }}>{name.charAt(0).toUpperCase()}</Text>
            </View>
          )}
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          <Button title={photoBusy ? 'Opening…' : photo ? 'Change photo' : 'Add photo'} variant="secondary" onPress={choosePhoto} disabled={photoBusy} />
          {photo && <Button title="Remove photo" variant="secondary" onPress={confirmRemovePhoto} disabled={photoBusy} />}
          <Text style={{ color: t.muted, fontSize: 12 }}>Shown on your graph. Kept only in this app's encrypted storage.</Text>
        </View>
      </View>

      <Card>
        <Text style={{ color: t.text, fontSize: 16 }}>{lastContactText(rel.lastContactAgeDays)}</Text>
        {rel.expectedIntervalDays !== null && (
          <Text style={{ color: t.muted }}>
            {rel.onRhythm !== null && rel.onRhythm >= 0.5 ? 'On rhythm' : 'Behind usual rhythm'} · hoping to catch up
            every {Math.round(rel.expectedIntervalDays)} days
          </Text>
        )}
        <View style={{ marginTop: 12 }}>
          <Button
            title={`Log a catch-up with ${name}`}
            onPress={() => router.push({ pathname: '/log', params: { person: personId } })}
          />
        </View>
      </Card>

      <Card style={{ gap: 0 }}>
        <Label>Catch-ups</Label>
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

      <View style={{ marginTop: 24 }}>
        <Text style={{ color: t.muted, marginBottom: 8, lineHeight: 20 }}>
          Archiving keeps their history. Deleting removes {name} and every record about them, including from catch-ups
          you logged with others. It cannot be undone.
        </Text>
        <Button title={`Delete ${name}`} variant="danger" onPress={confirmDelete} disabled={saving} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, gap: 20 },
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  photo: { width: 96, height: 96, borderRadius: 48, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: 12 },
});
