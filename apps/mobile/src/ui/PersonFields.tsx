import { DEFAULT_CONFIG, type Rating, type RelationshipState } from '@sg/score-engine';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_NAME_LENGTH, type PersonDraft } from '../data/people';
import { ChoiceChips, Label, MultiChoiceChips } from './components';
import { CATEGORY_LABELS, IMPORTANCE_LABELS, QUALITY_LABELS, RHYTHM_LABELS, STATE_LABELS } from './labels';
import { useTheme } from './theme';

const RATINGS: Rating[] = [1, 2, 3, 4, 5];
const NOT_RATED = 0;

const options = <K extends string>(labels: Record<K, string>) =>
  (Object.keys(labels) as K[]).map((value) => ({ value, label: labels[value] }));

const STATE_HINTS: Record<RelationshipState, string> = {
  active: '',
  paused: 'Not counted towards your rhythm for now.',
  long_distance: 'Your expected rhythm is relaxed to twice as long.',
  archived: 'Hidden from your network and left out of your score. You can restore it later.',
  in_memoriam: 'Kept with care and left out of your score.',
};

/** Shared fields for adding and editing a person. `showState` adds the status picker (edit only). */
export function PersonFields({
  draft,
  onChange,
  nameError,
  showState = false,
  autoFocusName = false,
}: {
  draft: PersonDraft;
  onChange: (draft: PersonDraft) => void;
  nameError?: string | null;
  showState?: boolean;
  autoFocusName?: boolean;
}) {
  const t = useTheme();
  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => onChange({ ...draft, [key]: value });
  const effectiveRhythm = draft.rhythm ?? DEFAULT_CONFIG.defaultRhythm[draft.category];

  return (
    <>
      <View>
        <Label>Name</Label>
        <TextInput
          value={draft.displayName}
          onChangeText={(v) => set('displayName', v)}
          placeholder="e.g. Ana"
          placeholderTextColor={t.muted}
          maxLength={MAX_NAME_LENGTH}
          autoFocus={autoFocusName}
          autoCapitalize="words"
          returnKeyType="done"
          accessibilityLabel="Name"
          style={[styles.input, { color: t.text, borderColor: nameError ? t.danger : t.border, backgroundColor: t.card }]}
        />
        {nameError && <Text style={{ color: t.danger, marginTop: 6 }}>{nameError}</Text>}
      </View>

      <View>
        <Label>Relationship</Label>
        <ChoiceChips options={options(CATEGORY_LABELS)} value={draft.category} onChange={(v) => set('category', v)} />
      </View>

      <View>
        <Label>Also part of (optional)</Label>
        <MultiChoiceChips
          options={options(CATEGORY_LABELS).filter((o) => o.value !== draft.category)}
          values={draft.alsoCategories.filter((c) => c !== draft.category)}
          onChange={(v) => set('alsoCategories', v)}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          For example, family who are also colleagues. Shown where the groups overlap on the graph.
        </Text>
      </View>

      <View>
        <Label>How important is this relationship to you?</Label>
        <ChoiceChips
          options={RATINGS.map((r) => ({ value: r, label: IMPORTANCE_LABELS[r] }))}
          value={draft.importance}
          onChange={(v) => set('importance', v)}
        />
      </View>

      <View>
        <Label>How often would you like to be in touch?</Label>
        <ChoiceChips options={options(RHYTHM_LABELS)} value={effectiveRhythm} onChange={(v) => set('rhythm', v)} />
        {draft.rhythm === null && (
          <Text style={[styles.hint, { color: t.muted }]}>
            Suggested for {CATEGORY_LABELS[draft.category].toLowerCase()}.
          </Text>
        )}
      </View>

      <View>
        <Label>How is this relationship right now? (optional)</Label>
        <ChoiceChips
          options={[
            { value: NOT_RATED, label: 'Not rated' },
            ...RATINGS.map((r) => ({ value: r, label: QUALITY_LABELS[r] })),
          ]}
          value={draft.quality ?? NOT_RATED}
          onChange={(v) => set('quality', v === NOT_RATED ? null : (v as Rating))}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          Only you can see this.{draft.quality === 1 ? ' Relationships rated harmful are left out of your score.' : ''}
        </Text>
      </View>

      {showState && (
        <View>
          <Label>Status</Label>
          <ChoiceChips options={options(STATE_LABELS)} value={draft.state} onChange={(v) => set('state', v)} />
          {STATE_HINTS[draft.state] !== '' && (
            <Text style={[styles.hint, { color: t.muted }]}>{STATE_HINTS[draft.state]}</Text>
          )}
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  hint: { fontSize: 13, marginTop: 6 },
});
