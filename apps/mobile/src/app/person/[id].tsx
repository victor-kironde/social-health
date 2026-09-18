import { DEFAULT_CONFIG, computeScore, type RelationshipContribution } from '@sg/score-engine';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HEALTH_LABELS, IDEAL_COMPARISON_LABELS, bandLabelOf, compareToIdeal, personalHealth, relationshipHealth } from '../../data/health';
import { HealthPill } from '../../graph/PersonStatsCard';
import { pickPersonPhoto, photoUri } from '../../data/photos';
import { draftFromSnapshot, editPersonEvents, validatePerson, type PersonDraft } from '../../data/people';
import { useStore } from '../../data/store';
import { Button, Card, Label, MultiChoiceChips } from '../../ui/components';
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
  const { log, updatePerson, deletePerson, photos, setPhoto, groups, updateGroup } = useStore();
  // Opened from "Set ideal": scroll straight to that question once it is laid out.
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const scroller = useRef<ScrollView>(null);
  const scrolledToIdeal = useRef(false);
  const onIdealLayout = (y: number) => {
    if (focus !== 'ideal' || scrolledToIdeal.current) return;
    scrolledToIdeal.current = true;
    setTimeout(() => scroller.current?.scrollTo({ y: Math.max(0, y - 16), animated: true }), 250);
  };
  const myGroups = groups.filter((g) => g.members.includes(personId)).map((g) => g.id);
  // Joining or leaving a group saves straight away.
  const setGroups = (ids: string[]) => {
    for (const g of groups) {
      const was = g.members.includes(personId);
      const now = ids.includes(g.id);
      if (was === now) continue;
      updateGroup({ ...g, members: now ? [...g.members, personId] : g.members.filter((m) => m !== personId) }).catch(
        (e: unknown) => setError(`Could not update the group: ${String(e)}`),
      );
    }
  };
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
    <ScrollView ref={scroller} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
        {(() => {
          const { score, band } = personalHealth(rel);
          return (
            <>
              <HealthPill score={score} label={`${HEALTH_LABELS[band]} (out of 10)`} colour={t.health[band]} large />
              <Text style={{ color: t.muted, marginTop: 6 }}>
                {!rel.idealSet
                  ? 'Your ideal: not set, so counted as 10 (as close as possible). Set it below.'
                  : rel.ideal === null
                    ? "Your ideal: don't mind, so this relationship is left out of your score."
                    : `Your ideal: ${rel.ideal} (${bandLabelOf(rel.ideal)}) · ${IDEAL_COMPARISON_LABELS[compareToIdeal(score, rel.ideal)]}`}
              </Text>
            </>
          );
        })()}
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
                style={[styles.historyItem, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border }]}
              >
                <View style={styles.historyRow}>
                  <Text style={{ color: t.text, flexShrink: 1 }}>
                    {INTERACTION_LABELS[x.type]}
                    {others.length > 0 ? ` with ${others.join(', ')}` : ''}
                  </Text>
                  <Text style={{ color: t.muted }}>{formatDate(x.ts)}</Text>
                </View>
                {x.note && (
                  <Text style={{ color: t.muted, fontStyle: 'italic', lineHeight: 19 }} numberOfLines={4}>
                    {x.note}
                  </Text>
                )}
              </View>
            );
          })
        )}
      </Card>

      <Card>
        <Label>Groups</Label>
        {groups.length === 0 ? (
          <Text style={{ color: t.muted, marginBottom: 8 }}>You have no groups yet.</Text>
        ) : (
          <MultiChoiceChips options={groups.map((g) => ({ value: g.id, label: g.name }))} values={myGroups} onChange={setGroups} />
        )}
        <View style={{ marginTop: 10 }}>
          <Button
            title={groups.length === 0 ? 'Create a group' : 'Manage groups'}
            variant="secondary"
            onPress={() =>
              router.push(groups.length === 0 ? { pathname: '/group/[id]', params: { id: 'new', with: personId } } : '/groups')
            }
          />
        </View>
      </Card>

      <PersonFields
        onIdealLayout={onIdealLayout}
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
  historyItem: { paddingVertical: 10, gap: 4 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
});
