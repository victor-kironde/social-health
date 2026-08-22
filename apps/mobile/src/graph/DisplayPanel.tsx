import type { Rating } from '@sg/score-engine';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ChoiceChips, Label, ToggleChip } from '../ui/components';
import { CATEGORY_LABELS } from '../ui/labels';
import { useTheme } from '../ui/theme';
import { ORDER_LABELS, type OrderBy } from './arrange';
import { ALL_CATEGORIES, DEFAULT_DISPLAY, type DisplayOptions } from './display';

const MIN_IMPORTANCE: { value: Rating; label: string }[] = [
  { value: 1, label: 'Everyone' },
  { value: 2, label: '2+' },
  { value: 3, label: '3+' },
  { value: 4, label: '4+' },
  { value: 5, label: 'Only 5' },
];

/** Bottom sheet with every display toggle and filter for the network graph. */
export function DisplayPanel({
  visible,
  options: o,
  onChange,
  onClose,
  hasTies,
}: {
  visible: boolean;
  options: DisplayOptions;
  onChange: (o: DisplayOptions) => void;
  onClose: () => void;
  /** Link and group options only mean something once people have been seen together. */
  hasTies: boolean;
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const set = <K extends keyof DisplayOptions>(key: K, value: DisplayOptions[K]) => onChange({ ...o, [key]: value });
  const flip = (key: 'sets' | 'egoEdges' | 'ties' | 'names' | 'sizeByFrequency' | 'colourByQuality' | 'colourByGroup' | 'behindOnly' | 'hideNeverContacted') =>
    set(key, !o[key]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close display options" />
      <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + 12, borderColor: t.border }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]}>Display & filters</Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={12}>
            <Text style={{ color: t.accent, fontWeight: '600' }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.content}>
          <View>
            <Label>Arrange</Label>
            <ChoiceChips
              options={[
                { value: 'rings' as const, label: 'Rings around you' },
                { value: 'tiers' as const, label: 'Tiers (list)' },
              ]}
              value={o.arrange}
              onChange={(v) => set('arrange', v)}
            />
          </View>
          <View>
            <Label>Order by (closest ring, top row)</Label>
            <ChoiceChips
              options={(Object.keys(ORDER_LABELS) as OrderBy[]).map((value) => ({ value, label: ORDER_LABELS[value] }))}
              value={o.orderBy}
              onChange={(v) => set('orderBy', v)}
            />
          </View>
          <View>
            <Label>Show</Label>
            <View style={styles.chips}>
              <ToggleChip label="Relationship type areas" on={o.sets} onPress={() => flip('sets')} />
              <ToggleChip label="Size by contact frequency" on={o.sizeByFrequency} onPress={() => flip('sizeByFrequency')} />
              <ToggleChip label="Lines to you" on={o.egoEdges} onPress={() => flip('egoEdges')} />
              {hasTies && <ToggleChip label="Links between people" on={o.ties} onPress={() => flip('ties')} />}
              <ToggleChip label="Names" on={o.names} onPress={() => flip('names')} />
              <ToggleChip label="Colour lines by quality" on={o.colourByQuality} onPress={() => flip('colourByQuality')} />
              {hasTies && <ToggleChip label="Colour rings by group" on={o.colourByGroup} onPress={() => flip('colourByGroup')} />}
            </View>
          </View>
          <View>
            <Label>Relationship types</Label>
            <View style={styles.chips}>
              {ALL_CATEGORIES.map((c) => (
                <ToggleChip
                  key={c}
                  label={CATEGORY_LABELS[c]}
                  dot={t.category[c]}
                  on={o.categories.includes(c)}
                  onPress={() =>
                    set('categories', o.categories.includes(c) ? o.categories.filter((x) => x !== c) : [...o.categories, c])
                  }
                />
              ))}
            </View>
            <Text style={[styles.hint, { color: t.muted }]}>Someone with several types shows if any of them is on.</Text>
          </View>
          <View>
            <Label>Importance</Label>
            <ChoiceChips options={MIN_IMPORTANCE} value={o.minImportance} onChange={(v) => set('minImportance', v)} />
          </View>
          <View>
            <Label>Contact</Label>
            <View style={styles.chips}>
              <ToggleChip label="Behind rhythm only" on={o.behindOnly} onPress={() => flip('behindOnly')} />
              <ToggleChip label="Hide never contacted" on={o.hideNeverContacted} onPress={() => flip('hideNeverContacted')} />
            </View>
          </View>
          <Button title="Reset to defaults" variant="secondary" onPress={() => onChange(DEFAULT_DISPLAY)} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { maxHeight: '80%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderTopWidth: StyleSheet.hairlineWidth },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  title: { fontSize: 17, fontWeight: '700' },
  content: { paddingHorizontal: 16, paddingBottom: 8, gap: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { fontSize: 12, marginTop: 6 },
});
