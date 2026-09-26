import { resolveRelationships } from '@sg/score-engine';
import { goBack } from '../../ui/nav';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_GROUP_NAME, validateGroup } from '../../data/groups';
import { onlyPeople } from '../../data/kinds';
import { useModelConfig } from '../../data/prefs';
import { useStore } from '../../data/store';
import { Button, Label, MultiChoiceChips } from '../../ui/components';
import { useTheme } from '../../ui/theme';

/** Create (id = "new"), rename, change members of, or delete one of your groups. */
export default function GroupEditor() {
  const t = useTheme();
  // `with`: someone to start a new group with (e.g. from their page).
  const { id, with: withPerson } = useLocalSearchParams<{ id: string; with?: string }>();
  const { groups, log, addGroup, updateGroup, deleteGroup, status } = useStore();
  const existing = id === 'new' ? undefined : groups.find((g) => g.id === id);
  const [name, setName] = useState(existing?.name ?? '');
  const [members, setMembers] = useState<string[]>(existing?.members ?? (withPerson ? [withPerson] : []));
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const config = useModelConfig();
  const people = useMemo(() => {
    const rels = resolveRelationships(log.relationshipEvents, config, Date.now());
    return onlyPeople(log.people)
      .filter((p) => !['archived', 'in_memoriam'].includes(rels.get(p.id)?.state ?? 'active') || members.includes(p.id))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [log, members, config]);
  const q = search.trim().toLowerCase();
  // Members first, then everyone matching the search.
  const shown = [
    ...people.filter((p) => members.includes(p.id)),
    ...people.filter((p) => !members.includes(p.id) && (!q || p.displayName.toLowerCase().includes(q))),
  ];

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
        <Text style={{ color: t.muted }}>This group no longer exists.</Text>
      </View>
    );
  }

  async function save() {
    const invalid = validateGroup(name, groups, existing?.id);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      if (existing) await updateGroup({ ...existing, name: name.trim(), members });
      else await addGroup(name, members);
      goBack();
    } catch (e) {
      setError(`Could not save: ${String(e)}`);
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!existing) return;
    Alert.alert(`Delete “${existing.name}”?`, 'The group is removed. Its people stay in your network.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteGroup(existing.id);
          goBack();
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? existing.name : 'New group' }} />
      <View>
        <Label>Name</Label>
        <TextInput
          value={name}
          onChangeText={(v) => {
            setName(v);
            setError(null);
          }}
          placeholder="e.g. Book club"
          placeholderTextColor={t.muted}
          maxLength={MAX_GROUP_NAME}
          autoFocus={!existing}
          autoCapitalize="sentences"
          accessibilityLabel="Group name"
          style={[styles.input, { color: t.text, borderColor: error ? t.danger : t.border, backgroundColor: t.card }]}
        />
        {error && <Text style={{ color: t.danger, marginTop: 6 }}>{error}</Text>}
      </View>

      <View>
        <Label>
          Who is in it? ({members.length})
        </Label>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search people"
          placeholderTextColor={t.muted}
          accessibilityLabel="Search people"
          style={[styles.input, styles.search, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
        <MultiChoiceChips
          options={shown.map((p) => ({ value: p.id, label: p.displayName }))}
          values={members}
          onChange={setMembers}
        />
        {people.length === 0 && <Text style={{ color: t.muted, marginTop: 6 }}>Add people first, then put them in groups.</Text>}
      </View>

      <Button title={saving ? 'Saving…' : existing ? 'Save changes' : 'Create group'} onPress={save} disabled={saving} />
      {existing && <Button title="Delete group" variant="danger" onPress={confirmDelete} disabled={saving} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  search: { marginBottom: 10, fontSize: 15 },
});
