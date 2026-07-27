import { DEFAULT_CONFIG, type Category, type Rating, type Rhythm } from '@sg/score-engine';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_NAME_LENGTH, validatePerson, type NewPersonInput } from '../../data/people';
import { useStore } from '../../data/store';
import { Button, ChoiceChips, Label } from '../../ui/components';
import { CATEGORY_LABELS, IMPORTANCE_LABELS, QUALITY_LABELS, RHYTHM_LABELS } from '../../ui/labels';
import { useTheme } from '../../ui/theme';

const options = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

const RATINGS: Rating[] = [1, 2, 3, 4, 5];
const NOT_RATED = 0;

export default function NewPerson() {
  const t = useTheme();
  const { addPerson } = useStore();

  const [displayName, setDisplayName] = useState('');
  const [category, setCategory] = useState<Category>('friend');
  const [importance, setImportance] = useState<Rating>(3);
  // null = follow the category default until the user picks a rhythm.
  const [rhythm, setRhythm] = useState<Rhythm | null>(null);
  const [quality, setQuality] = useState<Rating | typeof NOT_RATED>(NOT_RATED);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveRhythm = rhythm ?? DEFAULT_CONFIG.defaultRhythm[category];

  async function save() {
    const input: NewPersonInput = {
      displayName,
      category,
      importance,
      ...(rhythm ? { rhythm } : {}),
      quality: quality === NOT_RATED ? null : quality,
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
      <View>
        <Label>Name</Label>
        <TextInput
          value={displayName}
          onChangeText={(v) => {
            setDisplayName(v);
            setError(null);
          }}
          placeholder="e.g. Ana"
          placeholderTextColor={t.muted}
          maxLength={MAX_NAME_LENGTH}
          autoFocus
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Name"
          style={[styles.input, { color: t.text, borderColor: error ? t.danger : t.border, backgroundColor: t.card }]}
        />
        {error && <Text style={{ color: t.danger, marginTop: 6 }}>{error}</Text>}
      </View>

      <View>
        <Label>Relationship</Label>
        <ChoiceChips options={options(CATEGORY_LABELS)} value={category} onChange={setCategory} />
      </View>

      <View>
        <Label>How important is this relationship to you?</Label>
        <ChoiceChips
          options={RATINGS.map((r) => ({ value: r, label: IMPORTANCE_LABELS[r] }))}
          value={importance}
          onChange={setImportance}
        />
      </View>

      <View>
        <Label>How often would you like to be in touch?</Label>
        <ChoiceChips options={options(RHYTHM_LABELS)} value={effectiveRhythm} onChange={setRhythm} />
        {rhythm === null && (
          <Text style={[styles.hint, { color: t.muted }]}>Suggested for {CATEGORY_LABELS[category].toLowerCase()}.</Text>
        )}
      </View>

      <View>
        <Label>How is this relationship right now? (optional)</Label>
        <ChoiceChips
          options={[
            { value: NOT_RATED, label: 'Not rated' },
            ...RATINGS.map((r) => ({ value: r, label: QUALITY_LABELS[r] })),
          ]}
          value={quality}
          onChange={setQuality}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          Only you can see this.{quality === 1 ? ' Relationships rated harmful are left out of your score.' : ''}
        </Text>
      </View>

      <Button title={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 13, marginTop: 6 },
});
