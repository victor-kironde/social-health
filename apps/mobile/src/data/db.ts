import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { Rating } from '@sg/score-engine';
import type { PlacedPoint } from '../graph/layout';
import { toRow, type EventRow, type StoredEvent } from './codec';

const KEY_NAME = 'db-key-v1';
const DB_NAME = 'social-graph.db';

/** Index i upgrades the schema from user_version i to i + 1. Never edit a shipped entry; append. */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS event (
     id TEXT PRIMARY KEY NOT NULL,
     kind TEXT NOT NULL,
     ts INTEGER NOT NULL,
     body TEXT NOT NULL
   );
   CREATE INDEX IF NOT EXISTS event_kind_ts ON event (kind, ts);`,
  // Graph layout cache: display state, not history, so it lives outside the event log.
  `CREATE TABLE IF NOT EXISTS graph_position (
     person_id TEXT PRIMARY KEY NOT NULL,
     x REAL NOT NULL,
     y REAL NOT NULL,
     importance INTEGER NOT NULL
   );`,
];

export interface DbStatus {
  cipherVersion: string | null;
  schemaVersion: number;
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

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  for (let v = row?.user_version ?? 0; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]!);
      await db.execAsync(`PRAGMA user_version = ${v + 1};`);
    });
  }
}

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open the SQLCipher database. The key must be set before any other statement. */
export function openDb(): Promise<SQLite.SQLiteDatabase> {
  dbPromise ??= (async () => {
    const key = await getOrCreateKey();
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    // Raw hex key: skips PBKDF2 since the key is already random, not a password.
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    await migrate(db);
    return db;
  })();
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

export async function loadRows(): Promise<EventRow[]> {
  const db = await openDb();
  return db.getAllAsync<EventRow>('SELECT id, kind, ts, body FROM event;');
}

/** Appends all events or none. */
export async function appendEvents(events: StoredEvent[]): Promise<void> {
  const db = await openDb();
  await db.withTransactionAsync(async () => {
    for (const e of events) {
      const r = toRow(e);
      await db.runAsync('INSERT INTO event (id, kind, ts, body) VALUES (?, ?, ?, ?);', [r.id, r.kind, r.ts, r.body]);
    }
  });
}

export async function loadGraphPositions(): Promise<Map<string, PlacedPoint>> {
  const db = await openDb();
  const rows = await db.getAllAsync<{ person_id: string; x: number; y: number; importance: number }>(
    'SELECT person_id, x, y, importance FROM graph_position;',
  );
  return new Map(rows.map((r) => [r.person_id, { x: r.x, y: r.y, importance: r.importance as Rating }]));
}

/** Replaces the saved layout with `positions`, atomically. */
export async function saveGraphPositions(positions: Map<string, PlacedPoint>): Promise<void> {
  const db = await openDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM graph_position;');
    for (const [id, p] of positions) {
      if (p.importance === undefined) continue;
      await db.runAsync('INSERT INTO graph_position (person_id, x, y, importance) VALUES (?, ?, ?, ?);', [
        id,
        p.x,
        p.y,
        p.importance,
      ]);
    }
  });
}

/** Confirms encryption is active: `cipher_version` returns nothing on plain SQLite. */
export async function dbStatus(): Promise<DbStatus> {
  const db = await openDb();
  const cipher = await db.getFirstAsync<{ cipher_version: string }>('PRAGMA cipher_version;');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM event;');
  return {
    cipherVersion: cipher?.cipher_version ?? null,
    schemaVersion: version?.user_version ?? 0,
    eventCount: count?.n ?? 0,
  };
}
