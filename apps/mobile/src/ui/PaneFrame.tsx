import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { ExpandIcon } from '../graph/icons';
import { goBack } from './nav';
import { useTheme } from './theme';

/**
 * Frames a page as a pane over the graph (which stays visible around it) rather than a full
 * screen. The expand button grows it to fill the screen and back; × or a tap outside closes it.
 */
export function PaneFrame({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={StyleSheet.absoluteFill}>
      {!expanded && (
        <Pressable style={[StyleSheet.absoluteFill, styles.scrim]} onPress={goBack} accessibilityLabel={`Close ${title}`} />
      )}
      <View
        style={[
          expanded ? StyleSheet.absoluteFill : styles.pane,
          !expanded && { top: insets.top + 12, bottom: insets.bottom + 12 },
          expanded && { paddingTop: insets.top },
          { backgroundColor: t.bg, borderColor: t.border },
        ]}
      >
        <View style={[styles.head, { borderBottomColor: t.border }]}>
          <Text style={[styles.title, { color: t.text }]} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={expanded ? 'Make smaller' : 'Expand to full screen'}
            style={styles.icon}
          >
            {expanded ? <CollapseIcon colour={t.muted} /> : <ExpandIcon colour={t.muted} />}
          </Pressable>
          <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Close ${title}`} style={styles.icon}>
            <Text style={{ color: t.muted, fontSize: 24, lineHeight: 26 }}>×</Text>
          </Pressable>
        </View>
        <View style={{ flex: 1 }}>{children}</View>
      </View>
    </View>
  );
}

/** Back to a pane: two arrows pointing in. */
function CollapseIcon({ colour }: { colour: string }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M20 10h-6V4M14 10l7-7M4 14h6v6M10 14l-7 7" stroke={colour} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: 'rgba(0,0,0,0.25)' },
  pane: {
    position: 'absolute',
    left: 12,
    width: '92%',
    maxWidth: 640,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    elevation: 8,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  icon: { minWidth: 24, alignItems: 'center' },
});
