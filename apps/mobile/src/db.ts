import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';

const KEY_NAME = 'db-key-v1';
const DB_NAME = 'social-graph.db';

export interface DbStatus {
  cipherVersion: string | null;
  eventCount: number;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 256-bit random key, generated once and kept in Android Keystore-backed SecureStore. */
async function getOrCreateKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY_NAME);
  if (existing) return existing;
  const key = toHex(getRandomBytes(32));
  await SecureStore.setItemAsync(KEY_NAME, key);
  return key;
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open the SQLCipher database. The key must be set before any other statement. */
export function openDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const key = await getOrCreateKey();
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    // Raw hex key: skips PBKDF2 since the key is already random, not a password.
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS event (
        id TEXT PRIMARY KEY NOT NULL,
        kind TEXT NOT NULL,
        ts INTEGER NOT NULL,
        body TEXT NOT NULL
      );
    `);
    return db;
  })();
  return dbPromise;
}

/** Confirms encryption is active: `cipher_version` returns nothing on plain SQLite. */
export async function dbStatus(): Promise<DbStatus> {
  const db = await openDb();
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM event;');
  return { cipherVersion: cipher?.cipher_version ?? null, eventCount: count?.n ?? 0 };
}
