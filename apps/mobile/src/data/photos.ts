import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/** Stored photo size: enough for the largest node and the detail page, small enough to keep in the database. */
export const PHOTO_SIZE = 192;

/**
 * Lets the user choose a photo (the system picker: no storage permission
 * needed), crops it square, shrinks it to PHOTO_SIZE and returns it as a
 * base64 JPEG. The picker's temporary copy is deleted, so the only copy the
 * app keeps is the small one in the encrypted database. Null if cancelled.
 */
export async function pickPersonPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
    exif: false,
  });
  if (result.canceled || !result.assets[0]) return null;
  const uri = result.assets[0].uri;
  try {
    const image = await ImageManipulator.manipulate(uri).resize({ width: PHOTO_SIZE, height: PHOTO_SIZE }).renderAsync();
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
    removeQuietly(saved.uri);
    return saved.base64 ?? null;
  } finally {
    removeQuietly(uri);
  }
}

/** A data URI for <Image>. */
export const photoUri = (jpeg: string) => `data:image/jpeg;base64,${jpeg}`;

function removeQuietly(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Temporary files live in the app's cache; the OS clears them eventually.
  }
}
