import { pbkdf2 } from 'react-native-quick-crypto';
import type { DeriveKey } from './exportCrypto';
import { KDF_SELF_TEST } from './kdfVector';

/**
 * Native PBKDF2-HMAC-SHA256 (OpenSSL via react-native-quick-crypto), off the
 * JS thread. Same algorithm and output as jsDeriveKey, so files are
 * interchangeable; checked on the device by kdfSelfTest().
 */
export const nativeDeriveKey: DeriveKey = (password, salt, iterations) =>
  new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, 'sha256', (err, key) => {
      if (err || !key) reject(err ?? new Error('Key derivation failed'));
      else resolve(new Uint8Array(key));
    });
  });

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** Checks the native KDF against the known answer and times a full-strength derivation. */
export async function kdfSelfTest(iterations: number): Promise<{ correct: boolean; ms: number }> {
  const enc = new TextEncoder();
  const k = await nativeDeriveKey(enc.encode(KDF_SELF_TEST.password), enc.encode(KDF_SELF_TEST.salt), KDF_SELF_TEST.iterations);
  const start = performance.now();
  await nativeDeriveKey(enc.encode('timing'), enc.encode('timing-salt-16by'), iterations);
  return { correct: hex(k) === KDF_SELF_TEST.expectedHex, ms: performance.now() - start };
}
