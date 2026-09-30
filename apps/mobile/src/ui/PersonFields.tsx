import type { Rating, RelationshipState } from '@sg/score-engine';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { bandLabelOf } from '../data/health';
import { MAX_NAME_LENGTH, type PersonDraft } from '../data/people';
import { usePrefs } from '../data/prefs';
import { ChoiceChips, HelpTip, Label, MultiChoiceChips, TipText, ToggleChip } from './components';
import { ScalePicker } from './ScalePicker';
import { CATEGORY_LABELS, QUALITY_LABELS, STATE_LABELS, importanceLabel } from './labels';
import { RhythmPicker, choiceText } from './RhythmPicker';
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
        <Label help="For example, family who are also colleagues. Shown where the type areas overlap on the graph.">
          Also part of
        </Label>
        <MultiChoiceChips
          options={options(CATEGORY_LABELS).filter((o) => o.value !== draft.category)}
          values={draft.alsoCategories.filter((c) => c !== draft.category)}
          onChange={(v) => set('alsoCategories', v)}
        />
      </View>

      <View>
        <Label
          help={
            <>
              <TipText>More important people count more in your score, and sit closer to you on the graph.</TipText>
              <TipText>Rough guide: 1–2 peripheral, 3–4 casual, 5–6 moderate, 7–8 close, 9–10 very close.</TipText>
            </>
          }
        >
          How important is this relationship to you?
        </Label>
        <ScalePicker value={draft.importance} onChange={(v) => set('importance', v)} low="Peripheral" high="Very close" label="Importance" />
        <Text style={[styles.hint, { color: t.muted }]}>{importanceLabel(draft.importance)}</Text>
      </View>

      <View onLayout={(e) => onIdealLayout?.(e.nativeEvent.layout.y)}>
        <Label
          help={
            <>
              <TipText>
                Your score counts a relationship as doing well when it is near the closeness you hope for, not when it
                is as close as possible.
              </TipText>
              <TipText>Not set: counted as 10 (as close as possible) until you choose.</TipText>
              <TipText>Lower it for a relationship you would like to keep at a distance.</TipText>
              <TipText>“Don't mind” leaves the relationship out of your score.</TipText>
            </>
          }
        >
          How close would you like to be?
        </Label>
        <ScalePicker value={draft.ideal} onChange={(v) => set('ideal', v)} low="Distant" high="As close as possible" label="Ideal closeness" />
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <ToggleChip label="Don't mind" on={draft.ideal === null} onPress={() => set('ideal', draft.ideal === null ? 10 : null)} />
        </View>
        <Text style={[styles.hint, { color: t.muted }]}>
          {draft.ideal === undefined
            ? 'Not set (counted as 10)'
            : draft.ideal === null
              ? 'Left out of your score'
              : `${draft.ideal} · ${bandLabelOf(draft.ideal)}`}
        </Text>
      </View>

      <View style={styles.switchRow}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ color: t.text, fontSize: 15, fontWeight: '600' }}>Lives or works with you</Text>
          <HelpTip title="Lives or works with you">
            You see each other anyway, so time between logged catch-ups counts a tenth as much.
          </HelpTip>
        </View>
        <Switch
          value={draft.together}
          onValueChange={(v) => set('together', v)}
          accessibilityLabel="Lives or works with you"
          trackColor={{ true: t.accent, false: t.track }}
        />
      </View>

      <View>
        <Label help="Your score checks whether you are keeping to this rhythm; catching up more often never counts against you. “Default” follows the rhythm set in Settings (at least once a month unless you change it).">
          How often would you like to catch up?
        </Label>
        <RhythmPicker
          value={{ rhythm: draft.rhythm, frequency: draft.frequency }}
          onChange={(c) => onChange({ ...draft, rhythm: c.rhythm, frequency: c.frequency })}
          defaultText={choiceText(prefs.defaultRhythm)}
        />
      </View>

      <View>
        <Label help="Only you can see this. Relationships rated harmful are left out of your score.">
          How is this relationship right now?
        </Label>
        <ChoiceChips
          options={[
            { value: NOT_RATED, label: 'Not rated' },
            ...RATINGS.map((r) => ({ value: r, label: QUALITY_LABELS[r] })),
          ]}
          value={draft.quality ?? NOT_RATED}
          onChange={(v) => set('quality', v === NOT_RATED ? null : (v as Rating))}
        />
        {draft.quality === 1 && (
          <Text style={[styles.hint, { color: t.muted }]}>Left out of your score.</Text>
        )}
      </View>

      {showState && (
        <View>
          <Label
            help={
              <>
                {(Object.keys(STATE_HINTS) as RelationshipState[])
                  .filter((s) => STATE_HINTS[s])
                  .map((s) => (
                    <TipText key={s}>
                      <Text style={{ fontWeight: '700' }}>{STATE_LABELS[s]}: </Text>
                      {STATE_HINTS[s]}
                    </TipText>
                  ))}
              </>
            }
          >
            Status
          </Label>
          <ChoiceChips options={options(STATE_LABELS)} value={draft.state} onChange={(v) => set('state', v)} />
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
