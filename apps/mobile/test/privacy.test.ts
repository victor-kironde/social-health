import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { logFromRows, toRow, type StoredEvent } from '../src/data/codec';
import { DEFAULT_SECURITY, RELOCK_GRACE_MS, parseSettings, shouldRelock } from '../src/security/policy';
import { DATA_FORMAT, buildExportPayload, eraseFromLog } from '../src/data/erase';
import {
  WrongPasswordError,
  decryptExport,
  encryptExport,
  fromBase64,
  passwordProblem,
  toBase64,
  type EncryptedExport,
} from '../src/data/exportCrypto';

const random = (n: number) => new Uint8Array(randomBytes(n));
const FAST = 1000; // iterations: keep tests quick; the real default is much higher
const PASSWORD = 'correct horse battery';

describe('base64', () => {
  it('round-trips every length and matches Node', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = random(n);
      const b64 = toBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString('base64'));
      expect([...fromBase64(b64)]).toEqual([...bytes]);
    }
  });
});

describe('encrypted export', () => {
  it('round-trips with the right password', async () => {
    const text = JSON.stringify({ hello: 'world', unicode: 'Ana · Zoë 👋' });
    const file = await encryptExport(text, PASSWORD, random, FAST);
    expect(await decryptExport(file, PASSWORD)).toBe(text);
  });

  it('does not contain the plaintext', async () => {
    const file = await encryptExport('Ana is a close friend', PASSWORD, random, FAST);
    expect(JSON.stringify(file)).not.toContain('Ana');
  });

  it('uses a fresh salt and nonce each time', async () => {
    const a = await encryptExport('same', PASSWORD, random, FAST);
    const b = await encryptExport('same', PASSWORD, random, FAST);
    expect(a.kdf.salt).not.toBe(b.kdf.salt);
    expect(a.cipher.nonce).not.toBe(b.cipher.nonce);
    expect(a.data).not.toBe(b.data);
  });

  it('rejects a wrong password', async () => {
    const file = await encryptExport('secret', PASSWORD, random, FAST);
    await expect(decryptExport(file, 'wrong password!!')).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('detects tampering with the data', async () => {
    const file = await encryptExport('secret', PASSWORD, random, FAST);
    const bytes = fromBase64(file.data);
    bytes[0] = bytes[0]! ^ 1;
    await expect(decryptExport({ ...file, data: toBase64(bytes) }, PASSWORD)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('detects tampering with the header (e.g. lowering the iterations)', async () => {
    const file = await encryptExport('secret', PASSWORD, random, FAST);
    const weakened: EncryptedExport = { ...file, kdf: { ...file.kdf, iterations: FAST - 1 } };
    await expect(decryptExport(weakened, PASSWORD)).rejects.toBeInstanceOf(WrongPasswordError);
  });

  it('refuses short or trivially predictable passwords', async () => {
    expect(passwordProblem('short')).toMatch(/at least/);
    expect(passwordProblem('aaaaaaaaaa')).toMatch(/predictable/);
    expect(passwordProblem('abababababab')).toMatch(/predictable/);
    expect(passwordProblem('1234567890')).toMatch(/predictable/);
    expect(passwordProblem('jihgfedcba')).toMatch(/predictable/);
    expect(passwordProblem('blue kettle 42')).toBeNull();
    expect(passwordProblem(PASSWORD)).toBeNull();
    await expect(encryptExport('x', 'short', random, FAST)).rejects.toThrow(/at least/);
  });
});

const NOW = Date.UTC(2026, 9, 7);
function ev(e: StoredEvent): StoredEvent {
  return e;
}
const log: StoredEvent[] = [
  ev({ id: 'p1', ts: NOW, kind: 'person', body: { id: 'ana', displayName: 'Ana' } }),
  ev({ id: 'p2', ts: NOW, kind: 'person', body: { id: 'ben', displayName: 'Ben' } }),
  ev({ id: 'r1', ts: NOW, kind: 'relationship', body: { id: 'r1', personId: 'ana', ts: NOW, field: 'importance', value: 5 } }),
  ev({ id: 'r2', ts: NOW, kind: 'relationship', body: { id: 'r2', personId: 'ben', ts: NOW, field: 'importance', value: 3 } }),
  ev({ id: 's1', ts: NOW, kind: 'support', body: { id: 's1', personId: 'ana', ts: NOW, support: 4 } }),
  ev({
    id: 'x1',
    ts: NOW,
    kind: 'interaction',
    body: { id: 'x1', ts: NOW, loggedAt: NOW, type: 'in_person', participants: ['ana'], source: 'manual' },
  }),
  ev({
    id: 'x2',
    ts: NOW,
    kind: 'interaction',
    body: { id: 'x2', ts: NOW, loggedAt: NOW, type: 'video', participants: ['ana', 'ben'], source: 'manual' },
  }),
  ev({ id: 'l1', ts: NOW, kind: 'logging', body: { ts: NOW, kind: 'entry_made' } }),
];

describe('eraseFromLog', () => {
  const { remove, replace } = eraseFromLog(log, 'ana');

  it('removes their profile, relationship changes, support reports and solo contacts', () => {
    expect(remove.sort()).toEqual(['p1', 'r1', 's1', 'x1']);
  });

  it('rewrites shared contacts without them, keeping the other people', () => {
    expect(replace).toHaveLength(1);
    expect(replace[0]!.id).toBe('x2');
    expect(replace[0]!.kind === 'interaction' && replace[0]!.body.participants).toEqual(['ben']);
  });

  it('leaves no trace of them in the rebuilt log', () => {
    const kept = log.filter((e) => !remove.includes(e.id)).map((e) => replace.find((r) => r.id === e.id) ?? e);
    expect(JSON.stringify(kept)).not.toContain('ana');
    const rebuilt = logFromRows(kept.map(toRow));
    expect(rebuilt.people.map((p) => p.id)).toEqual(['ben']);
  });

  it('does nothing for someone not in the log', () => {
    expect(eraseFromLog(log, 'nobody')).toEqual({ remove: [], replace: [] });
  });
});

describe('export payload', () => {
  it('contains every event and identifies itself', () => {
    const payload = JSON.parse(buildExportPayload(log, 3, NOW));
    expect(payload.format).toBe(DATA_FORMAT);
    expect(payload.schemaVersion).toBe(3);
    expect(payload.events).toEqual(log);
  });
});

describe('app lock policy', () => {
  it('defaults to locked-on when nothing (or garbage) is stored', () => {
    expect(DEFAULT_SECURITY.appLock).toBe(true);
    expect(parseSettings(null)).toEqual(DEFAULT_SECURITY);
    expect(parseSettings('not json')).toEqual(DEFAULT_SECURITY);
    expect(parseSettings('{"appLock":"yes"}')).toEqual(DEFAULT_SECURITY);
    expect(parseSettings('{"appLock":false,"relockImmediately":true}')).toEqual({ appLock: false, relockImmediately: true });
  });

  it('re-locks after the grace period, or at once if asked', () => {
    const on = { appLock: true, relockImmediately: false };
    expect(shouldRelock(on, 0, RELOCK_GRACE_MS - 1)).toBe(false);
    expect(shouldRelock(on, 0, RELOCK_GRACE_MS)).toBe(true);
    expect(shouldRelock({ ...on, relockImmediately: true }, 0, 1)).toBe(true);
    expect(shouldRelock({ ...on, appLock: false }, 0, 10 * RELOCK_GRACE_MS)).toBe(false);
    expect(shouldRelock(on, null, 10 * RELOCK_GRACE_MS)).toBe(false); // never left
  });
});
