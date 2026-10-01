import { getRandomBytes } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as SQLite from 'expo-sqlite';
import type { Rating } from '@sg/score-engine';
import type { PlacedPoint } from '../graph/layout';
import { fromRow, toRow, type EventRow, type StoredEvent } from './codec';
import { eraseFromLog } from './erase';
import { groupEvent, groupsFromEvents, type PersonGroup } from './groups';
import { planEvent, plansFromEvents, type Plan } from './plans';

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
  // Small key/value store for the layout cache (e.g. which ties it was laid out with).
  `CREATE TABLE IF NOT EXISTS graph_meta (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT NOT NULL
   );`,
  // Person photos: small square JPEGs (base64), kept in the encrypted database like everything
  // else. Not part of the event log: a photo is not history, and replacing one keeps no copy.
  `CREATE TABLE IF NOT EXISTS person_photo (
     person_id TEXT PRIMARY KEY NOT NULL,
     jpeg TEXT NOT NULL,
     updated_at INTEGER NOT NULL
   );`,
  // People the user moved on the graph: they stay where they were put until the layout is reset.
  `CREATE TABLE IF NOT EXISTS graph_pin (
     person_id TEXT PRIMARY KEY NOT NULL,
     x REAL NOT NULL,
     y REAL NOT NULL
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
    // Overwrite deleted content in place, so erased records do not linger in free pages.
    await db.execAsync('PRAGMA secure_delete = ON;');
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

/** Every stored event, oldest first (for export). */
export async function loadEvents(): Promise<StoredEvent[]> {
  const rows = await loadRows();
  return rows
    .sort((a, b) => a.ts - b.ts || (a.id < b.id ? -1 : 1))
    .map(fromRow)
    .filter((e): e is StoredEvent => e !== null);
}

/** Erases one person (see erase.ts) and their saved graph position, atomically. */
export async function erasePerson(personId: string): Promise<void> {
  const db = await openDb();
  const { remove, replace } = eraseFromLog(await loadEvents(), personId);
  await db.withTransactionAsync(async () => {
    for (const id of remove) await db.runAsync('DELETE FROM event WHERE id = ?;', [id]);
    for (const e of replace) await db.runAsync('UPDATE event SET body = ? WHERE id = ?;', [toRow(e).body, e.id]);
    await db.runAsync('DELETE FROM graph_position WHERE person_id = ?;', [personId]);
    await db.runAsync('DELETE FROM person_photo WHERE person_id = ?;', [personId]);
    await db.runAsync('DELETE FROM graph_pin WHERE person_id = ?;', [personId]);
  });
}

/** Where the user has put people on the graph, by person id. */
export async function loadPins(): Promise<Map<string, { x: number; y: number }>> {
  const db = await openDb();
  const rows = await db.getAllAsync<{ person_id: string; x: number; y: number }>('SELECT person_id, x, y FROM graph_pin;');
  return new Map(rows.map((r) => [r.person_id, { x: r.x, y: r.y }]));
}

export async function savePin(personId: string, x: number, y: number): Promise<void> {
  const db = await openDb();
  await db.runAsync('INSERT OR REPLACE INTO graph_pin (person_id, x, y) VALUES (?, ?, ?);', [personId, x, y]);
}

/** Forgets every moved position and the cached layout, so everyone is laid out afresh. */
export async function resetLayout(): Promise<void> {
  const db = await openDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM graph_pin;');
    await db.runAsync('DELETE FROM graph_position;');
    await db.runAsync("DELETE FROM graph_meta WHERE key = 'tie_signature';");
  });
}

/** The name the user goes by on their own node ("You" when unset). */
export async function loadMyName(): Promise<string> {
  const db = await openDb();
  return (await db.getFirstAsync<{ value: string }>("SELECT value FROM graph_meta WHERE key = 'my_name';"))?.value ?? '';
}

export async function saveMyName(name: string): Promise<void> {
  const db = await openDb();
  if (name.trim()) await db.runAsync("INSERT OR REPLACE INTO graph_meta (key, value) VALUES ('my_name', ?);", [name.trim()]);
  else await db.runAsync("DELETE FROM graph_meta WHERE key = 'my_name';");
}

/** Your groups (see groups.ts). */
export async function loadGroups(): Promise<PersonGroup[]> {
  return groupsFromEvents(await loadEvents());
}

/** Saves a group's current state, replacing any earlier record of it. */
export async function saveGroup(group: PersonGroup): Promise<void> {
  const db = await openDb();
  const row = toRow(groupEvent(group, Date.now()));
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM event WHERE id = ?;', [row.id]);
    await db.runAsync('INSERT INTO event (id, kind, ts, body) VALUES (?, ?, ?, ?);', [row.id, row.kind, row.ts, row.body]);
  });
}

/** Deletes a group for good (its people are untouched). */
export async function deleteGroup(groupId: string): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM event WHERE id = ?;', [`group:${groupId}`]);
}

/** Your planned meetups (see plans.ts). */
export async function loadPlans(): Promise<Plan[]> {
  return plansFromEvents(await loadEvents());
}

/** Saves a plan's current state, replacing any earlier record of it. */
export async function savePlan(plan: Plan): Promise<void> {
  const db = await openDb();
  const row = toRow(planEvent(plan, Date.now()));
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM event WHERE id = ?;', [row.id]);
    await db.runAsync('INSERT INTO event (id, kind, ts, body) VALUES (?, ?, ?, ?);', [row.id, row.kind, row.ts, row.body]);
  });
}

/** Deletes a plan for good (catch-ups already confirmed from it stay). */
export async function deletePlan(planId: string): Promise<void> {
  const db = await openDb();
  await db.runAsync('DELETE FROM event WHERE id = ?;', [`plan:${planId}`]);
}

/** Every person's photo (base64 JPEG), by person id. */
export async function loadPhotos(): Promise<Map<string, string>> {
  const db = await openDb();
  const rows = await db.getAllAsync<{ person_id: string; jpeg: string }>('SELECT person_id, jpeg FROM person_photo;');
  return new Map(rows.map((r) => [r.person_id, r.jpeg]));
}

/** Sets (or, with null, removes) a person's photo. */
export async function savePhoto(personId: string, jpeg: string | null): Promise<void> {
  const db = await openDb();
  if (jpeg === null) await db.runAsync('DELETE FROM person_photo WHERE person_id = ?;', [personId]);
  else {
    await db.runAsync(
      'INSERT INTO person_photo (person_id, jpeg, updated_at) VALUES (?, ?, ?) ON CONFLICT(person_id) DO UPDATE SET jpeg = excluded.jpeg, updated_at = excluded.updated_at;',
      [personId, jpeg, Date.now()],
    );
  }
}

/**
 * Deletes the database file and then its key. Without the key, any copy or
 * leftover of the file is unreadable (crypto-shredding). The next openDb()
 * starts a fresh, empty database with a new key.
 */
export async function deleteEverything(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise.catch(() => null);
    dbPromise = null;
    await db?.closeAsync();
  }
  await SQLite.deleteDatabaseAsync(DB_NAME);
  await SecureStore.deleteItemAsync(KEY_NAME);
}

/** Disconnecting the call log deletes every imported call and the connection itself. */
export async function deleteCallData(): Promise<void> {
  const db = await openDb();
  await db.runAsync("DELETE FROM event WHERE kind IN ('call', 'source');");
}

export async function schemaVersion(): Promise<number> {
  const db = await openDb();
  return (await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;'))?.user_version ?? 0;
}

export interface SavedLayout {
  positions: Map<string, PlacedPoint>;
  /** tieSignature() of the ties the positions were laid out with. */
  tieSignature: string;
}

export async function loadGraphLayout(): Promise<SavedLayout> {
  const db = await openDb();
  const rows = await db.getAllAsync<{ person_id: string; x: number; y: number; importance: number }>(
    'SELECT person_id, x, y, importance FROM graph_position;',
  );
  const meta = await db.getFirstAsync<{ value: string }>("SELECT value FROM graph_meta WHERE key = 'tie_signature';");
  return {
    positions: new Map(rows.map((r) => [r.person_id, { x: r.x, y: r.y, importance: r.importance as Rating }])),
    tieSignature: meta?.value ?? '',
  };
}

/** Replaces the saved layout, atomically. */
export async function saveGraphLayout({ positions, tieSignature }: SavedLayout): Promise<void> {
  const db = await openDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync("INSERT OR REPLACE INTO graph_meta (key, value) VALUES ('tie_signature', ?);", [tieSignature]);
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
