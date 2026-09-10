import * as SecureStore from 'expo-secure-store';

const INTRO_KEY = 'intro-seen-v1';

/** Whether the one-time introduction slides have been seen. */
export async function hasSeenIntro(): Promise<boolean> {
  return (await SecureStore.getItemAsync(INTRO_KEY)) === 'yes';
}

export async function markIntroSeen(): Promise<void> {
  await SecureStore.setItemAsync(INTRO_KEY, 'yes');
}

/** Lets the introduction be shown again (from Settings). */
export async function resetIntro(): Promise<void> {
  await SecureStore.deleteItemAsync(INTRO_KEY);
}
