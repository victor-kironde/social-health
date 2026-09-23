import type { Rating, RelationshipState } from '@sg/score-engine';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { bandLabelOf } from '../data/health';
import { MAX_NAME_LENGTH, type PersonDraft } from '../data/people';
import { usePrefs } from '../data/prefs';
import { ChoiceChips, Label, MultiChoiceChips } from './components';
import { CATEGORY_LABELS, QUALITY_LABELS, STATE_LABELS, importanceLabel } from './labels';
import { RhythmPicker, choiceText } from './RhythmPicker';
import { useTheme } from './theme';

const RATINGS: Rating[] = [1, 2, 3, 4, 5];
const IDEALS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const IMPORTANCE_SCALE = IDEALS;
/** The "Don't mind" chip (no ideal). */
const DONT_MIND = 0;
/** No chip selected: the ideal has not been set yet. */
const NOT_SET = -1;
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
  onIdealLayout,
}: {
  draft: PersonDraft;
  onChange: (draft: PersonDraft) => void;
  nameError?: string | null;
  showState?: boolean;
  autoFocusName?: boolean;
  /** Where the ideal question sits in the scroll content (to scroll straight to it). */
  onIdealLayout?: (y: number) => void;
}) {
  const t = useTheme();
  const set = <K extends keyof PersonDraft>(key: K, value: PersonDraft[K]) => onChange({ ...draft, [key]: value });
  const { prefs } = usePrefs();

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
        <Label>How important is this relationship to you? (optional)</Label>
        <ChoiceChips
          options={IMPORTANCE_SCALE.map((v) => ({ value: v, label: String(v) }))}
          value={draft.importance}
          onChange={(v) => set('importance', v)}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          {importanceLabel(draft.importance)}. More important people count more in your score.
        </Text>
        <Text style={[styles.hint, { color: t.muted, marginTop: 2 }]}>
          Rough guide: 1–2 peripheral, 3–4 casual, 5–6 moderate, 7–8 close, 9–10 very close.
        </Text>
      </View>

      <View onLayout={(e) => onIdealLayout?.(e.nativeEvent.layout.y)}>
        <Label>How close would you like to be?</Label>
        <ChoiceChips
          options={[
            ...IDEALS.map((v) => ({ value: v, label: String(v) })),
            { value: DONT_MIND, label: "Don't mind" },
          ]}
          value={draft.ideal === undefined ? NOT_SET : (draft.ideal ?? DONT_MIND)}
          onChange={(v) => set('ideal', v === DONT_MIND ? null : v)}
        />
        <Text style={[styles.hint, { color: t.muted }]}>
          {draft.ideal === undefined
            ? 'Not set yet: counted as 10 (as close as possible) until you choose.'
            : draft.ideal === null
            ? "Left out of your score: you don't mind where this relationship stands."
            : `${draft.ideal} · ${bandLabelOf(draft.ideal)}. ${
                draft.ideal === 10
                  ? 'As close as possible (the usual hope).'
                  : 'Your score counts this relationship as doing well when it is near this, not when it is as close as possible.'
              }`}
        </Text>
        <Text style={[styles.hint, { color: t.muted, marginTop: 2 }]}>
          Lower it for relationships you would like to keep at a distance, such as co-parenting with an ex.
        </Text>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>Lives or works with you</Text>
          <Text style={[styles.hint, { color: t.muted, marginTop: 2 }]}>
            You see each other anyway, so time between logged catch-ups counts a tenth as much.
          </Text>
        </View>
        <Switch
          value={draft.together}
          onValueChange={(v) => set('together', v)}
          accessibilityLabel="Lives or works with you"
          trackColor={{ true: t.accent, false: t.track }}
        />
      </View>

      <View>
        <Label>How often would you like to catch up?</Label>
        <RhythmPicker
          value={{ rhythm: draft.rhythm, frequency: draft.frequency }}
          onChange={(c) => onChange({ ...draft, rhythm: c.rhythm, frequency: c.frequency })}
          defaultText={choiceText(prefs.defaultRhythm)}
        />
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
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
