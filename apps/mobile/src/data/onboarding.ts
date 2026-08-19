import * as SecureStore from 'expo-secure-store';

const KEY = 'onboarded-v1';

/** Whether the first-run welcome has been seen (shown once, when the network is empty). */
export async function hasOnboarded(): Promise<boolean> {
  return (await SecureStore.getItemAsync(KEY)) === 'yes';
}

export async function markOnboarded(): Promise<void> {
  await SecureStore.setItemAsync(KEY, 'yes');
}
