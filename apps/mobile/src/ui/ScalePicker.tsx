import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from './theme';

const STEPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const DOT = 14;
const PICKED = 28;

/**
 * A marked 1–10 scale: a row of dots joined by a line, each numbered underneath, deepening in
 * colour along the scale. Tap a dot to choose it; the chosen dot grows and shows its number.
 * `value` undefined (or null) means nothing is chosen yet.
 */
export function ScalePicker({
  value,
  onChange,
  low,
  high,
  label,
}: {
  value: number | null | undefined;
  onChange: (v: number) => void;
  /** Words under each end of the scale, e.g. "Peripheral" and "Very close". */
  low: string;
  high: string;
  /** For screen readers, e.g. "Importance". */
  label: string;
}) {
  const t = useTheme();
  // Faint to full accent: a calm ramp that never reads as a rating (no red or green).
  const colour = (v: number) => `${t.accent}${Math.round(90 + (165 * (v - 1)) / 9).toString(16).padStart(2, '0')}`;
  const chosen = typeof value === 'number' ? value : null;
  return (
    <View accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ min: 1, max: 10, now: chosen ?? undefined }}>
      <View style={styles.track}>
        <View style={[styles.line, { backgroundColor: t.border }]} />
        {STEPS.map((v) => {
          const picked = v === chosen;
          return (
            <Pressable
              key={v}
              onPress={() => onChange(v)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityState={{ selected: picked }}
              accessibilityLabel={`${label} ${v}`}
              style={styles.slot}
            >
              <View
                style={[
                  styles.dot,
                  picked
                    ? { width: PICKED, height: PICKED, borderRadius: PICKED / 2, backgroundColor: t.accent, borderColor: t.accent }
                    : {
                        backgroundColor: chosen !== null && v < chosen ? colour(v) : t.bg,
                        borderColor: colour(v),
                      },
                ]}
              >
                {picked && <Text style={{ color: t.onAccent, fontSize: 12, fontWeight: '800' }}>{v}</Text>}
              </View>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.marks}>
        {STEPS.map((v) => (
          <Text key={v} style={[styles.mark, { color: v === chosen ? t.text : t.muted, fontWeight: v === chosen ? '700' : '400' }]}>
            {v}
          </Text>
        ))}
      </View>
      <View style={styles.ends}>
        <Text style={{ color: t.muted, fontSize: 12 }}>{low}</Text>
        <Text style={{ color: t.muted, fontSize: 12 }}>{high}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: PICKED + 8, maxWidth: 520 },
  line: { position: 'absolute', left: PICKED / 2, right: PICKED / 2, height: 2, borderRadius: 1 },
  slot: { width: PICKED, height: PICKED, alignItems: 'center', justifyContent: 'center' },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  marks: { flexDirection: 'row', justifyContent: 'space-between', maxWidth: 520 },
  mark: { width: PICKED, textAlign: 'center', fontSize: 11 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', maxWidth: 520, marginTop: 2 },
});
