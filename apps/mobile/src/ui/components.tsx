import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[styles.card, { backgroundColor: t.card }, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.label, { color: t.muted }]}>{children}</Text>;
}

export function Button({
  title,
  onPress,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: t.accent }
          : danger
            ? { backgroundColor: t.danger }
            : { borderColor: t.border, borderWidth: 1 },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.8 },
      ]}
    >
      <Text style={[styles.buttonText, { color: primary ? t.onAccent : danger ? '#ffffff' : t.text }]}>{title}</Text>
    </Pressable>
  );
}

/** Single-choice row of chips. */
export function ChoiceChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips} accessibilityRole="radiogroup">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[
              styles.chip,
              selected ? { backgroundColor: t.accent } : { borderColor: t.border, borderWidth: 1 },
            ]}
          >
            <Text style={{ color: selected ? t.onAccent : t.text }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A single on/off chip, optionally with a coloured dot (e.g. a category). */
export function ToggleChip({
  label,
  on,
  onPress,
  dot,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  dot?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.chip,
        styles.toggle,
        on ? { backgroundColor: t.card, borderColor: t.accent, borderWidth: 1.5 } : { borderColor: t.border, borderWidth: 1 },
      ]}
    >
      {dot && <View style={[styles.dot, { backgroundColor: dot, opacity: on ? 1 : 0.35 }]} />}
      <Text style={{ color: on ? t.text : t.muted }}>{label}</Text>
    </Pressable>
  );
}

/** Multiple-choice row of chips; selected chips show a tick. */
export function MultiChoiceChips<T extends string>({
  options,
  values,
  onChange,
}: {
  options: { value: T; label: string }[];
  values: T[];
  onChange: (values: T[]) => void;
}) {
  const t = useTheme();
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const checked = values.includes(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={o.label}
            onPress={() => onChange(checked ? values.filter((v) => v !== o.value) : [...values, o.value])}
            style={[
              styles.chip,
              checked ? { backgroundColor: t.accent } : { borderColor: t.border, borderWidth: 1 },
            ]}
          >
            <Text style={{ color: checked ? t.onAccent : t.text }}>
              {checked ? '✓ ' : ''}
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, padding: 16, gap: 4 },
  label: { fontSize: 13, marginBottom: 6 },
  button: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, minHeight: 36, justifyContent: 'center' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
