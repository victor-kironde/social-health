import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { markOnboarded } from '../data/onboarding';
import { Button, Card } from '../ui/components';
import { useTheme } from '../ui/theme';

const POINTS = [
  {
    title: 'See your connections',
    body: 'Add the people who matter to you and log when you are in touch. The app shows how your relationships are going over time.',
  },
  {
    title: 'Private by design',
    body: 'Everything stays on this phone, in an encrypted database. Nothing is sent anywhere, and only you can see your ratings.',
  },
  {
    title: 'A reflection, not a judgement',
    body: 'The score is an aid for noticing changes, not a diagnosis or a measure of your worth. There are no streaks or leaderboards.',
  },
];

/** First-run welcome: what the app is for, then how to add the first people. */
export default function Welcome() {
  const t = useTheme();

  async function go(next: () => void) {
    await markOnboarded().catch(() => undefined);
    next();
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.title, { color: t.text }]}>Welcome to Social Graph</Text>
      {POINTS.map((p) => (
        <Card key={p.title}>
          <Text style={[styles.point, { color: t.text }]}>{p.title}</Text>
          <Text style={{ color: t.muted, lineHeight: 20 }}>{p.body}</Text>
        </Card>
      ))}

      <Text style={[styles.lead, { color: t.text }]}>Start with the people who matter to you</Text>
      <View style={styles.gap}>
        <Button
          title="Choose from my contacts"
          onPress={() => go(() => router.replace({ pathname: '/import', params: { from: 'welcome' } }))}
        />
      </View>
      <Text style={{ color: t.muted, lineHeight: 20 }}>
        You pick who to add. Only their names are copied, never numbers or other details.
      </Text>
      <View style={styles.gap}>
        <Button title="Add someone myself" variant="secondary" onPress={() => go(() => router.replace('/person/new'))} />
      </View>
      <View style={styles.gap}>
        <Button title="Skip for now" variant="secondary" onPress={() => go(() => router.back())} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 4 },
  point: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  lead: { fontSize: 18, fontWeight: '600', marginTop: 12 },
  gap: { marginTop: 4 },
});
