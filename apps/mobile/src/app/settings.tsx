import { MODEL_VERSION } from '@sg/score-engine';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { schemaVersion } from '../data/db';
import { cleanUpExports, exportData } from '../data/exportFile';
import { MIN_PASSWORD_LENGTH, passwordProblem } from '../data/exportCrypto';
import { useStore } from '../data/store';
import { useSecurity } from '../security/AppLock';
import { RELOCK_GRACE_MS } from '../security/policy';
import { Button, Card, Label } from '../ui/components';
import { useTheme } from '../ui/theme';

const CONFIRM_WORD = 'DELETE';

export default function Settings() {
  const t = useTheme();
  const { deleteAllData } = useStore();
  const { settings, deviceSecure, update } = useSecurity();
  const [schema, setSchema] = useState<number | null>(null);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleteText, setDeleteText] = useState('');

  useEffect(() => {
    cleanUpExports();
    schemaVersion().then(setSchema).catch(() => setSchema(null));
  }, []);

  const passwordError =
    password.length === 0 ? null : passwordProblem(password) ?? (confirm && confirm !== password ? 'The passwords do not match.' : null);
  const canEncrypt = !busy && password.length > 0 && !passwordError && confirm === password;

  async function runExport(withPassword: string | null) {
    setBusy(withPassword ? 'Encrypting your data… this can take a few seconds.' : 'Preparing your data…');
    setMessage(null);
    try {
      const { encryptMs } = await exportData(withPassword);
      setPassword('');
      setConfirm('');
      setMessage(
        withPassword
          ? `Export ready (encrypted in ${(encryptMs / 1000).toFixed(1)} s). Keep the password safe: it cannot be recovered.`
          : 'Export ready.',
      );
    } catch (e) {
      setMessage(`Export failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  function confirmPlainExport() {
    Alert.alert(
      'Export without encryption?',
      'Anyone who gets this file can read every name, rating and contact you have recorded. Only do this if you will store it somewhere private.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export unencrypted', style: 'destructive', onPress: () => runExport(null) },
      ],
    );
  }

  async function runDeleteAll() {
    setBusy('Deleting everything…');
    try {
      await deleteAllData();
      setDeleteText('');
      router.dismissAll();
    } catch (e) {
      setMessage(`Delete failed: ${String(e)}`);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(next: Partial<typeof settings>) {
    const ok = await update({ ...settings, ...next });
    if (!ok && next.appLock === true && !deviceSecure) {
      Alert.alert('Set a screen lock first', 'App lock uses your phone’s PIN, pattern or biometrics. Add one in your phone’s settings, then turn app lock on.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Card>
        <Label>Security</Label>
        <Row
          title="App lock"
          detail="Ask for your fingerprint, face or phone PIN when opening Social Graph."
          value={settings.appLock && deviceSecure}
          onChange={(v) => toggle({ appLock: v })}
        />
        {!deviceSecure && (
          <Text style={{ color: t.warn, marginTop: 4 }}>
            Your phone has no screen lock, so app lock is unavailable. Set a PIN, pattern or biometrics in your phone’s settings to use it.
          </Text>
        )}
        <Row
          title="Lock as soon as I leave"
          detail={`Otherwise the app stays unlocked for ${RELOCK_GRACE_MS / 1000} seconds after you switch away.`}
          value={settings.relockImmediately}
          disabled={!settings.appLock || !deviceSecure}
          onChange={(v) => toggle({ relockImmediately: v })}
        />
      </Card>

      <Card>
        <Label>People</Label>
        <Text style={{ color: t.muted, lineHeight: 20 }}>
          Add people from your phone’s contacts. You choose who; only names are copied.
        </Text>
        <View style={styles.gap}>
          <Button title="Import from contacts" variant="secondary" onPress={() => router.push('/import')} />
        </View>
      </Card>

      <Card>
        <Label>Export your data</Label>
        <Text style={{ color: t.muted, lineHeight: 20 }}>
          Everything you have recorded, in one file you can keep. Encrypted with a password you choose; without it the file cannot be read, and the password cannot be recovered.
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder={`Password (at least ${MIN_PASSWORD_LENGTH} characters)`}
          placeholderTextColor={t.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Export password"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
        />
        <TextInput
          value={confirm}
          onChangeText={setConfirm}
          placeholder="Repeat the password"
          placeholderTextColor={t.muted}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Repeat export password"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
        />
        {passwordError && <Text style={{ color: t.danger }}>{passwordError}</Text>}
        <View style={styles.gap}>
          <Button title="Export encrypted" onPress={() => runExport(password)} disabled={!canEncrypt} />
        </View>
        <View style={styles.gap}>
          <Button title="Export without encryption…" variant="secondary" onPress={confirmPlainExport} disabled={!!busy} />
        </View>
      </Card>

      {(busy || message) && (
        <Card style={styles.status}>
          {busy && <ActivityIndicator color={t.accent} />}
          <Text style={{ color: t.text, flex: 1 }}>{busy ?? message}</Text>
        </Card>
      )}

      <Card>
        <Label>Delete all data</Label>
        <Text style={{ color: t.muted, lineHeight: 20 }}>
          Permanently deletes everyone you have added, every contact and rating, and the key that encrypts them. This cannot be undone. Export first if you want a copy.
        </Text>
        <TextInput
          value={deleteText}
          onChangeText={setDeleteText}
          placeholder={`Type ${CONFIRM_WORD} to confirm`}
          placeholderTextColor={t.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          accessibilityLabel={`Type ${CONFIRM_WORD} to confirm deleting all data`}
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.bg }]}
        />
        <View style={styles.gap}>
          <Button
            title="Delete everything"
            variant="danger"
            onPress={runDeleteAll}
            disabled={!!busy || deleteText.trim() !== CONFIRM_WORD}
          />
        </View>
      </Card>

      <Card>
        <Label>About</Label>
        <Text style={{ color: t.muted, lineHeight: 20 }}>
          Social Graph {Constants.expoConfig?.version ?? ''} · score model v{MODEL_VERSION} · database schema v{schema ?? '…'}
          {'\n'}Everything stays on this phone, in an encrypted database. Nothing is sent anywhere.
        </Text>
      </Card>
    </ScrollView>
  );
}

function Row({
  title,
  detail,
  value,
  disabled,
  onChange,
}: {
  title: string;
  detail: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontSize: 16 }}>{title}</Text>
        <Text style={{ color: t.muted, marginTop: 2 }}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} accessibilityLabel={title} />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, marginTop: 10 },
  gap: { marginTop: 10 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
