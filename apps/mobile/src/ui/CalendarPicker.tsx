import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { MONTH_NAMES, addMonths, dateDaysAgo, daysBetween, localDate, monthGrid, type LocalDate } from './calendar';
import { useTheme } from './theme';

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * A month calendar for choosing a day from `maxDaysAgo` back to `maxDaysAhead` ahead (by default
 * only past days). Returns the choice as calendar days ago (negative = ahead), which is how
 * catch-ups are recorded.
 */
export function CalendarPicker({
  visible,
  daysAgo,
  maxDaysAgo,
  maxDaysAhead = 0,
  onPick,
  onClose,
}: {
  visible: boolean;
  daysAgo: number;
  maxDaysAgo: number;
  maxDaysAhead?: number;
  onPick: (daysAgo: number) => void;
  onClose: () => void;
}) {
  const t = useTheme();
  const today = localDate(Date.now());
  const [shown, setShown] = useState(() => ({ year: today.year, month: today.month }));
  const weeks = monthGrid(shown.year, shown.month);
  const canBack = daysBetween({ ...shown, day: 1 }, today) <= maxDaysAgo;
  const lastDay = dateDaysAgo(today, -maxDaysAhead);
  const canForward = shown.year * 12 + shown.month < lastDay.year * 12 + lastDay.month;

  const dayState = (day: number) => {
    const d: LocalDate = { year: shown.year, month: shown.month, day };
    const ago = daysBetween(d, today);
    return { ago, enabled: ago >= -maxDaysAhead && ago <= maxDaysAgo, selected: ago === daysAgo, isToday: ago === 0 };
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close calendar">
        <Pressable style={[styles.card, { backgroundColor: t.card, borderColor: t.border }]} onPress={() => undefined}>
          <View style={styles.header}>
            <Arrow label="Previous month" text="‹" enabled={canBack} onPress={() => setShown(addMonths(shown.year, shown.month, -1))} />
            <Text style={[styles.month, { color: t.text }]}>
              {MONTH_NAMES[shown.month]} {shown.year}
            </Text>
            <Arrow label="Next month" text="›" enabled={canForward} onPress={() => setShown(addMonths(shown.year, shown.month, 1))} />
          </View>
          <View style={styles.week}>
            {WEEKDAYS.map((w, i) => (
              <Text key={i} style={[styles.cell, styles.weekday, { color: t.muted }]}>
                {w}
              </Text>
            ))}
          </View>
          {weeks.map((week, wi) => (
            <View key={wi} style={styles.week}>
              {week.map((day, di) => {
                if (day === null) return <View key={di} style={styles.cell} />;
                const s = dayState(day);
                return (
                  <Pressable
                    key={di}
                    disabled={!s.enabled}
                    onPress={() => {
                      onPick(s.ago);
                      onClose();
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: s.selected, disabled: !s.enabled }}
                    accessibilityLabel={`${day} ${MONTH_NAMES[shown.month]}`}
                    style={[
                      styles.cell,
                      styles.day,
                      s.selected && { backgroundColor: t.accent },
                      !s.selected && s.isToday && { borderColor: t.accent, borderWidth: 1 },
                    ]}
                  >
                    <Text style={{ color: s.selected ? t.onAccent : s.enabled ? t.text : t.border, fontWeight: s.isToday ? '700' : '400' }}>
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
          <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center', marginTop: 8 }}>
            {maxDaysAhead > 0 ? 'Up to a year back or ahead.' : 'Up to a year back. Future days can’t be chosen.'}
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Arrow({ label, text, enabled, onPress }: { label: string; text: string; enabled: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!enabled} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={styles.arrow}>
      <Text style={{ color: enabled ? t.text : t.border, fontSize: 26 }}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 14, width: '100%', maxWidth: 380 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  month: { fontSize: 17, fontWeight: '700' },
  arrow: { width: 40, alignItems: 'center' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', margin: 2 },
  weekday: { aspectRatio: undefined, height: 22, textAlign: 'center', fontSize: 12 },
  day: { borderRadius: 999 },
});
