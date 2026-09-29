import { getRandomBytes } from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { loadEvents, schemaVersion } from './db';
import { buildExportPayload } from './erase';
import { DEFAULT_ITERATIONS, encryptExport } from './exportCrypto';
import { nativeDeriveKey } from './nativeKdf';

const PREFIX = 'social-graph-export';

/**
 * Removes export files left in the app's cache by earlier exports. The share
 * sheet reads the file after we hand it over, so it cannot be deleted
 * straight away; it is cleaned up on the next visit to Settings instead.
 */
export function cleanUpExports(): void {
  try {
    for (const item of new Directory(Paths.cache).list()) {
      if (item instanceof File && (item.name.startsWith(PREFIX) || item.name.startsWith('social-health-report') || item.name.endsWith('.pdf'))) item.delete();
    }
  } catch {
    // Nothing to clean, or the cache is unavailable: not worth surfacing.
  }
}

/**
 * Writes all data to a file and opens the system share sheet so the user can
 * save or send it. With a password the file is encrypted (exportCrypto.ts);
 * without one it is readable JSON.
 */
export async function exportData(password: string | null): Promise<{ encryptMs: number }> {
  cleanUpExports();
  const payload = buildExportPayload(await loadEvents(), await schemaVersion(), Date.now());
  const start = performance.now();
  const contents = password
    ? JSON.stringify(await encryptExport(payload, password, getRandomBytes, DEFAULT_ITERATIONS, nativeDeriveKey), null, 1)
    : payload;
  const encryptMs = performance.now() - start;

  const date = new Date().toISOString().slice(0, 10);
  const file = new File(Paths.cache, `${PREFIX}-${date}${password ? '-encrypted' : ''}.json`);
  if (file.exists) file.delete();
  file.create();
  file.write(contents);
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    dialogTitle: password ? 'Save encrypted export' : 'Save export (not encrypted)',
  });
  return { encryptMs };
}
