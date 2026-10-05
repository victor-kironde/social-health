import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MAX_NAME_LENGTH } from '../data/people';
import { photoUri, pickPersonPhoto } from '../data/photos';
import { useStore } from '../data/store';
import { ME_ID } from '../graph/model';
import { Button, Label } from '../ui/components';
import { goBack } from '../ui/nav';
import { useTheme } from '../ui/theme';

const SIZE = 112;

/** Your own node, the circle at the centre of the graph: your photo and the name shown under it. */
export default function Me() {
  const t = useTheme();
  const { photos, setPhoto, myName, setMyName } = useStore();
  const photo = photos.get(ME_ID);
  const [name, setName] = useState(myName);
  const [busy, setBusy] = useState(false);

  async function choosePhoto() {
    setBusy(true);
    try {
      const jpeg = await pickPersonPhoto();
      if (jpeg) await setPhoto(ME_ID, jpeg);
    } catch (e) {
      Alert.alert('Could not use that photo', String(e));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemovePhoto() {
    Alert.alert('Remove your photo?', 'The centre of your graph will say “You” again.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => setPhoto(ME_ID, null).catch(() => undefined) },
    ]);
  }

  async function save() {
    setBusy(true);
    try {
      await setMyName(name);
      goBack();
    } catch (e) {
      Alert.alert('Could not save', String(e));
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.head}>
        <Pressable onPress={choosePhoto} disabled={busy} accessibilityRole="button" accessibilityLabel={photo ? 'Change your photo' : 'Add your photo'}>
          <View style={[styles.avatar, { backgroundColor: t.accent, borderColor: t.accent }]}>
            {photo ? (
              <Image source={{ uri: photoUri(photo) }} style={styles.photo} />
            ) : (
              <Text style={{ color: t.onAccent, fontWeight: '800', fontSize: 20 }}>You</Text>
            )}
          </View>
        </Pressable>
        <View style={{ flex: 1, gap: 8 }}>
          <Button title={busy ? 'Opening…' : photo ? 'Change photo' : 'Add photo'} variant="secondary" onPress={choosePhoto} disabled={busy} />
          {photo && <Button title="Remove photo" variant="secondary" onPress={confirmRemovePhoto} disabled={busy} />}
        </View>
      </View>

      <View>
        <Label help="Shown under your circle at the centre of the graph. Leave it empty to show “You”. Your photo and name stay in this app's encrypted storage.">
          Your name
        </Label>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="You"
          placeholderTextColor={t.muted}
          maxLength={MAX_NAME_LENGTH}
          autoCapitalize="words"
          accessibilityLabel="Your name"
          style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.card }]}
        />
      </View>

      <Button title={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy || name.trim() === myName} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 28, paddingLeft: 12 },
  avatar: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photo: { width: SIZE, height: SIZE },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
