import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { validatePerson, type PersonDraft } from '../../data/people';
import { useStore } from '../../data/store';
import { Button } from '../../ui/components';
import { PersonFields } from '../../ui/PersonFields';

export default function NewPerson() {
  const { addPerson } = useStore();
  const [draft, setDraft] = useState<PersonDraft>({
    displayName: '',
    category: 'friend',
    importance: 3,
    rhythm: null,
    quality: null,
    state: 'active',
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const input = {
      displayName: draft.displayName,
      category: draft.category,
      importance: draft.importance,
      ...(draft.rhythm ? { rhythm: draft.rhythm } : {}),
      quality: draft.quality,
    };
    const invalid = validatePerson(input);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    try {
      await addPerson(input);
      router.back();
    } catch (e) {
      setError(`Could not save: ${String(e)}`);
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
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
});
