import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStore } from '../data/store';
import { Button, Card } from '../ui/components';
import { useTheme } from '../ui/theme';

/** Your own groups of people: list, and a way to add one. */
export default function Groups() {
  const t = useTheme();
  const { groups, log } = useStore();
  const names = new Map(log.people.map((p) => [p.id, p.displayName]));

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={{ color: t.muted, lineHeight: 20 }}>
        Groups are relationships with a group as a whole, like a team, a book club or your patients. You can log
        catch-ups with a group, set how important it is and how often you hope to meet, and it appears on your graph
        with lines to its members. Someone can be in several groups.
      </Text>
      <Button title="New group" onPress={() => router.push({ pathname: '/group/[id]', params: { id: 'new' } })} />
      {groups.length === 0 ? (
        <Text style={{ color: t.muted, textAlign: 'center', marginTop: 12 }}>No groups yet.</Text>
      ) : (
        <Card style={{ gap: 0 }}>
          {groups.map((g, i) => (
            <Pressable
              key={g.id}
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/person/[id]', params: { id: g.id } })}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
                pressed && { opacity: 0.6 },
              ]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontSize: 16, fontWeight: '600' }}>{g.name}</Text>
                <Text style={{ color: t.muted }} numberOfLines={1}>
                  {g.members.length === 0
                    ? 'Nobody yet'
                    : `${g.members.length} · ${g.members.map((m) => names.get(m) ?? '?').sort().join(', ')}`}
                </Text>
              </View>
              <Text style={{ color: t.muted, fontSize: 20 }}>›</Text>
            </Pressable>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 8 },
});
