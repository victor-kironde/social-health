import type { Rating } from '@sg/score-engine';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ChoiceChips, Label, ToggleChip } from '../ui/components';
import { CATEGORY_LABELS } from '../ui/labels';
import { useTheme } from '../ui/theme';
import { ORDER_LABELS, type OrderBy } from './arrange';
import { ALL_CATEGORIES, DEFAULT_DISPLAY, type DisplayOptions } from './display';

/** "At least" thresholds on the 1–10 importance scale, at the start of each guide range. */
const MIN_IMPORTANCE: { value: number; label: string }[] = [
  { value: 1, label: 'Everyone' },
  { value: 3, label: '3+' },
  { value: 5, label: '5+' },
  { value: 7, label: '7+' },
  { value: 9, label: '9+' },
];

/** Bottom sheet with every display toggle and filter for the network graph. */
export function DisplayPanel({
  visible,
  options: o,
  onChange,
  onClose,
  hasTies,
  groups = [],
}: {
  visible: boolean;
  options: DisplayOptions;
  onChange: (o: DisplayOptions) => void;
  onClose: () => void;
  /** Link and group options only mean something once people have been seen together. */
  hasTies: boolean;
  /** Your own groups, for the areas choice and the group filter. */
  groups?: { id: string; name: string }[];
}) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const set = <K extends keyof DisplayOptions>(key: K, value: DisplayOptions[K]) => onChange({ ...o, [key]: value });
  const flip = (key: 'sets' | 'egoEdges' | 'ties' | 'names' | 'sizeByFrequency' | 'behindOnly' | 'hideNeverContacted') =>
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
              <ToggleChip label="Size by catch-up frequency" on={o.sizeByFrequency} onPress={() => flip('sizeByFrequency')} />
              <ToggleChip label="Lines to you" on={o.egoEdges} onPress={() => flip('egoEdges')} />
              {hasTies && <ToggleChip label="Links between people" on={o.ties} onPress={() => flip('ties')} />}
              <ToggleChip label="Names" on={o.names} onPress={() => flip('names')} />
            </View>
          </View>
          {groups.length > 0 && (
            <View>
              <Label>Shaded areas show</Label>
              <ChoiceChips
                options={[
                  { value: 'types' as const, label: 'Relationship types' },
                  { value: 'groups' as const, label: 'My groups' },
                ]}
                value={o.areas}
                onChange={(v) => set('areas', v)}
              />
            </View>
          )}
          <View>
            <Label>Colour people by</Label>
            <ChoiceChips
              options={[
                { value: 'health' as const, label: 'Relationship health' },
                { value: 'type' as const, label: 'Type' },
                ...(hasTies ? [{ value: 'group' as const, label: 'Group' }] : []),
              ]}
              value={o.colourBy}
              onChange={(v) => set('colourBy', v)}
            />
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
          {groups.length > 0 && (
            <View>
              <Label>My groups</Label>
              <View style={styles.chips}>
                {groups.map((g) => (
                  <ToggleChip
                    key={g.id}
                    label={g.name}
                    on={o.groups.includes(g.id)}
                    onPress={() =>
                      set('groups', o.groups.includes(g.id) ? o.groups.filter((x) => x !== g.id) : [...o.groups, g.id])
                    }
                  />
                ))}
              </View>
              <Text style={[styles.hint, { color: t.muted }]}>
                {o.groups.length ? 'Showing people in any chosen group.' : 'Choose groups to show only their people.'}
              </Text>
            </View>
          )}
          <View>
            <Label>Importance</Label>
            <ChoiceChips options={MIN_IMPORTANCE} value={o.minImportance} onChange={(v) => set('minImportance', v)} />
            <Text style={[styles.hint, { color: t.muted }]}>
              Your Social Health score updates to the people shown, so "7+" shows how your most important relationships
              are doing.
            </Text>
          </View>
          <View>
            <Label>Catch-ups</Label>
            <View style={styles.chips}>
              <ToggleChip label="Behind rhythm only" on={o.behindOnly} onPress={() => flip('behindOnly')} />
              <ToggleChip label="Hide not yet caught up" on={o.hideNeverContacted} onPress={() => flip('hideNeverContacted')} />
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
