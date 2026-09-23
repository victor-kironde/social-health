import { router } from 'expo-router';

/** Back to the previous screen, or to the graph when this screen was opened directly (e.g. by a link). */
export function goBack(): void {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}
