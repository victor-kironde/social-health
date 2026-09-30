import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from '../ui/theme';
import { ExpandIcon } from './icons';

/**
 * A see-through, scrollable pane floating over the graph (the key, score details, display
 * options), so the graph stays visible behind it. Optional expand button opens the full page.
 */
export function FloatingPane({
  title,
  onClose,
  onExpand,
  alpha = 'D0',
  side = 'left',
  style,
  children,
}: {
  title: string;
  onClose: () => void;
  onExpand?: () => void;
  /** Background opacity as a hex byte: lower lets more of the graph show through. */
  alpha?: string;
  /** Which edge of the graph the pane sits against. */
  side?: 'left' | 'right';
  style?: ViewStyle;
  children: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={[styles.pane, side === 'left' ? { left: 8 } : { right: 8 }, { backgroundColor: `${t.card}${alpha}`, borderColor: t.border }, style]}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>
          {title}
        </Text>
        {onExpand && (
          <Pressable onPress={onExpand} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Open ${title} full screen`} style={styles.icon}>
            <ExpandIcon colour={t.muted} />
          </Pressable>
        )}
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Close ${title}`} style={styles.icon}>
          <Text style={{ color: t.muted, fontSize: 22, lineHeight: 24 }}>×</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }}>{children}</ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  pane: {
    position: 'absolute',
    top: 8,
    width: '88%',
    maxWidth: 520,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '700', flex: 1 },
  icon: { minWidth: 24, alignItems: 'center' },
});
