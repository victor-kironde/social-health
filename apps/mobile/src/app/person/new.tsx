import { router } from 'expo-router';
import { goBack } from '../../ui/nav';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { validatePerson, type PersonDraft } from '../../data/people';
import { useStore } from '../../data/store';
import { Button } from '../../ui/components';
import { PersonFields } from '../../ui/PersonFields';
import { useTheme } from '../../ui/theme';

export default function NewPerson() {
  const t = useTheme();
  const { addPerson } = useStore();
  const [draft, setDraft] = useState<PersonDraft>({
    displayName: '',
    category: 'friend',
    alsoCategories: [],
    importance: 1,
    rhythm: null,
    quality: null,
    state: 'active',
    ideal: undefined,
    frequency: null,
    together: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const input = {
      displayName: draft.displayName,
      category: draft.category,
      alsoCategories: draft.alsoCategories,
      importance: draft.importance,
      ...(draft.rhythm ? { rhythm: draft.rhythm } : {}),
      quality: draft.quality,
      ...(draft.ideal !== undefined ? { ideal: draft.ideal } : {}),
      ...(draft.frequency ? { frequency: draft.frequency } : {}),
      ...(draft.together ? { together: true } : {}),
    };
    const invalid = validatePerson(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await addPerson(input);
      goBack();
    } catch (e) {
      setError(`Could not save: ${String(e)}`);
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Several people at once: pick them from the phone's contacts instead (names only). */}
      <Pressable
        onPress={() => router.replace('/import')}
        accessibilityRole="button"
        accessibilityHint="Opens your contacts to choose people to add"
        style={({ pressed }) => [styles.import, { borderColor: t.border, backgroundColor: t.card }, pressed && { opacity: 0.7 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontWeight: '600', fontSize: 15 }}>Choose from my contacts</Text>
          <Text style={{ color: t.muted, fontSize: 13, marginTop: 2 }}>Add several people at once. Only names are copied.</Text>
        </View>
        <Text style={{ color: t.muted, fontSize: 20 }}>›</Text>
      </Pressable>
      <View style={styles.or}>
        <View style={[styles.rule, { backgroundColor: t.border }]} />
        <Text style={{ color: t.muted, fontSize: 12 }}>or add someone yourself</Text>
        <View style={[styles.rule, { backgroundColor: t.border }]} />
      </View>
      <PersonFields
        draft={draft}
        onChange={(d) => {
          setDraft(d);
          setError(null);
        }}
        nameError={error}
        autoFocusName
      />
      <Button title={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  import: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1 },
  or: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: -4, marginBottom: -4 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
});
