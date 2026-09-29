import { DEFAULT_CONFIG, type Frequency, type FrequencyPeriod, type Rhythm } from '@sg/score-engine';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChoiceChips } from './components';
import { PRESET_TEXT, RHYTHM_LABELS, frequencyText } from './labels';
import { useTheme } from './theme';

/** A catch-up rhythm: a preset, a custom "at least N times a period", or (both null) the default. */
export interface RhythmChoice {
  rhythm: Rhythm | null;
  frequency: Frequency | null;
}

const CUSTOM = 'custom' as const;
const DEFAULT = 'default' as const;
const PERIODS: FrequencyPeriod[] = ['day', 'week', 'month', 'year'];

/** "15 days", "1.4 days", "8 hours": the interval a custom frequency expects. */
export function intervalText(f: Frequency): string {
  const days = DEFAULT_CONFIG.frequencyPeriodDays[f.per] / f.times;
  if (days < 1) return `${Math.round(days * 24)} hours`;
  const rounded = days < 10 ? Math.round(days * 10) / 10 : Math.round(days);
  return `${rounded} ${rounded === 1 ? 'day' : 'days'}`;
}

/** The rhythm in words: "At least twice a month", "At least once a month". */
export function choiceText(c: { rhythm: Rhythm; frequency: Frequency | null }): string {
  return c.frequency ? frequencyText(c.frequency) : PRESET_TEXT[c.rhythm];
}

/**
 * Choose how often to catch up: presets, or Custom… ("at least N times a day/week/month/year").
 * With `defaultText`, a "Default" chip lets the choice follow the default (set in Settings).
 */
export function RhythmPicker({
  value,
  onChange,
  defaultText,
}: {
  value: RhythmChoice;
  onChange: (next: RhythmChoice) => void;
  /** The current default in words, e.g. "At least once a month"; omit to hide the Default chip. */
  defaultText?: string;
}) {
  const t = useTheme();
  const followsDefault = value.rhythm === null && value.frequency === null;
  const selected = value.frequency ? CUSTOM : followsDefault ? (defaultText ? DEFAULT : 'monthly') : value.rhythm!;
  return (
    <View>
      <ChoiceChips
        options={[
          ...(defaultText ? [{ value: DEFAULT as string, label: 'Default' }] : []),
          ...(Object.keys(RHYTHM_LABELS) as Rhythm[]).map((r) => ({ value: r as string, label: RHYTHM_LABELS[r] })),
          { value: CUSTOM, label: 'Custom…' },
        ]}
        value={selected}
        onChange={(v) =>
          v === DEFAULT
            ? onChange({ rhythm: null, frequency: null })
            : v === CUSTOM
              ? onChange({ rhythm: null, frequency: value.frequency ?? { times: 2, per: 'month' } })
              : onChange({ rhythm: v as Rhythm, frequency: null })
        }
      />
      {value.frequency && (
        <View style={styles.custom}>
          <Text style={{ color: t.text, fontSize: 15 }}>At least</Text>
          <Stepper
            value={value.frequency.times}
            min={1}
            max={31}
            onChange={(times) => onChange({ rhythm: null, frequency: { ...value.frequency!, times } })}
          />
          <Text style={{ color: t.text, fontSize: 15 }}>{value.frequency.times === 1 ? 'time' : 'times'}</Text>
          <ChoiceChips
            options={PERIODS.map((p) => ({ value: p, label: `a ${p}` }))}
            value={value.frequency.per}
            onChange={(per) => onChange({ rhythm: null, frequency: { ...value.frequency!, per } })}
          />
        </View>
      )}
      {(value.frequency || (followsDefault && defaultText)) && (
        <Text style={[styles.hint, { color: t.muted }]}>
          {value.frequency
            ? `${frequencyText(value.frequency)} (about every ${intervalText(value.frequency)})`
            : `Following your default: ${defaultText!.toLowerCase()}`}
        </Text>
      )}
    </View>
  );
}

/** − n + control. */
export function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const t = useTheme();
  const button = (label: string, next: number, disabled: boolean) => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label === '−' ? 'Fewer' : 'More'}
      hitSlop={6}
      style={[styles.stepButton, { borderColor: t.border, opacity: disabled ? 0.4 : 1 }]}
    >
      <Text style={{ color: t.text, fontSize: 18, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={styles.stepper} accessibilityLabel={`${value} times`}>
      {button('−', value - 1, value <= min)}
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>{value}</Text>
      {button('+', value + 1, value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 13, marginTop: 6 },
  custom: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepButton: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
