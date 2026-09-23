import { router, useLocalSearchParams } from 'expo-router';
import { goBack } from '../ui/nav';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { contactCandidates, filterCandidates, nameKey, type Candidate } from '../data/contactsImport';
import { readContactNames } from '../data/deviceContacts';
import { useStore } from '../data/store';
import { Button, Card } from '../ui/components';
import { useTheme } from '../ui/theme';

type Phase =
  | { kind: 'intro' }
  | { kind: 'loading' }
  | { kind: 'denied'; canAskAgain: boolean }
  | { kind: 'choose'; candidates: Candidate[] };

/**
 * Pick people from the phone's contacts. Permission is requested only here,
 * when the user asks; nothing is selected by default; only names are stored.
 */
export default function ImportContacts() {
  const t = useTheme();
  const { log, importPeople } = useStore();
  const { from } = useLocalSearchParams<{ from?: string }>();
  // Coming from the welcome screen, the privacy explanation has just been shown.
  const [phase, setPhase] = useState<Phase>(from === 'welcome' ? { kind: 'loading' } : { kind: 'intro' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhase({ kind: 'loading' });
    try {
      const access = await readContactNames();
      if (access.status === 'denied') setPhase({ kind: 'denied', canAskAgain: access.canAskAgain });
      else setPhase({ kind: 'choose', candidates: contactCandidates(access.names, log.people.map((p) => p.displayName)) });
    } catch (e) {
      setError(`Could not read contacts: ${String(e)}`);
      setPhase({ kind: 'intro' });
    }
  }, [log.people]);

  useEffect(() => {
    if (from === 'welcome') load();
    // Only on arrival.
  }, []);

  const visible = useMemo(
    () => (phase.kind === 'choose' ? filterCandidates(phase.candidates, query) : []),
    [phase, query],
  );

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const key = nameKey(name);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  async function save() {
    if (phase.kind !== 'choose') return;
    const names = phase.candidates.filter((c) => !c.alreadyAdded && selected.has(nameKey(c.name))).map((c) => c.name);
    setSaving(true);
    try {
      await importPeople(names);
      goBack();
    } catch (e) {
      setError(`Could not import: ${String(e)}`);
      setSaving(false);
    }
  }

  if (phase.kind === 'intro') {
    return (
      <View style={styles.padded}>
        <Card>
          <Text style={[styles.title, { color: t.text }]}>Choose people from your contacts</Text>
          <Text style={{ color: t.muted, lineHeight: 20 }}>
            Social Graph will ask to read your contacts. You then pick who to add; nobody is selected for you.
            {'\n\n'}Only names are copied, into this phone’s encrypted storage. Phone numbers, emails and photos are never
            read or saved. You can turn contacts access off again in your phone’s settings at any time.
          </Text>
          {error && <Text style={{ color: t.danger, marginTop: 8 }}>{error}</Text>}
          <View style={styles.gap}>
            <Button title="Continue" onPress={load} />
          </View>
        </Card>
      </View>
    );
  }

  if (phase.kind === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  if (phase.kind === 'denied') {
    return (
      <View style={styles.padded}>
        <Card>
          <Text style={[styles.title, { color: t.text }]}>No access to contacts</Text>
          <Text style={{ color: t.muted, lineHeight: 20 }}>
            {phase.canAskAgain
              ? 'Without permission, people can still be added one by one.'
              : 'Contacts access is turned off for Social Graph. You can allow it in your phone’s settings, or add people one by one.'}
          </Text>
          <View style={styles.gap}>
            {phase.canAskAgain ? (
              <Button title="Try again" onPress={load} />
            ) : (
              <Button title="Open phone settings" onPress={() => Linking.openSettings()} />
            )}
          </View>
          <View style={styles.gap}>
            <Button title="Add someone myself" variant="secondary" onPress={() => router.replace('/person/new')} />
          </View>
        </Card>
      </View>
    );
  }

  const count = phase.candidates.filter((c) => !c.alreadyAdded && selected.has(nameKey(c.name))).length;

  return (
    <View style={styles.root}>
      <View style={styles.padded}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`Search ${phase.candidates.length} contacts`}
          placeholderTextColor={t.muted}
          autoCorrect={false}
          accessibilityLabel="Search contacts"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(c) => nameKey(c.name)}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={30}
        ListEmptyComponent={
          <Text style={{ color: t.muted, padding: 16 }}>
            {phase.candidates.length === 0 ? 'No contacts with names were found.' : 'No contacts match your search.'}
          </Text>
        }
        renderItem={({ item }) => {
          const on = selected.has(nameKey(item.name));
          return (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: item.alreadyAdded }}
              disabled={item.alreadyAdded}
              onPress={() => toggle(item.name)}
              style={[styles.row, { borderBottomColor: t.border }, item.alreadyAdded && { opacity: 0.5 }]}
            >
              <View style={[styles.box, { borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : 'transparent' }]}>
                {on && <Text style={{ color: t.onAccent, fontWeight: '700' }}>✓</Text>}
              </View>
              <Text style={{ color: t.text, fontSize: 16, flex: 1 }}>{item.name}</Text>
              {item.alreadyAdded && <Text style={{ color: t.muted }}>Already added</Text>}
            </Pressable>
          );
        }}
      />
      <View style={[styles.footer, { borderTopColor: t.border, backgroundColor: t.bg }]}>
        {error && <Text style={{ color: t.danger, marginBottom: 6 }}>{error}</Text>}
        <Text style={{ color: t.muted, marginBottom: 8 }}>
          Added as friends of moderate importance. You can change each person afterwards.
        </Text>
        <Button
          title={saving ? 'Adding…' : count === 0 ? 'Choose people to add' : `Add ${count} ${count === 1 ? 'person' : 'people'}`}
          onPress={save}
          disabled={count === 0 || saving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  padded: { padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 6 },
  gap: { marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  footer: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth },
});
