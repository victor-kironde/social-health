import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';

/**
 * Password-protected export files. AES-256-GCM (authenticated: tampering or
 * a wrong password is detected) with a key derived by PBKDF2-HMAC-SHA256
 * from a random 16-byte salt. The header (format, KDF and cipher
 * parameters) is bound to the ciphertext as associated data, so it cannot
 * be edited to weaken decryption. Pure TypeScript (audited @noble
 * libraries), so it runs in Hermes and in Node tests alike.
 */

export const EXPORT_FORMAT = 'social-graph-export';
export const MIN_PASSWORD_LENGTH = 10;
/** Chosen from timing on the target phone; see docs/threat-model.md. */
export const DEFAULT_ITERATIONS = 310_000;

export interface EncryptedExport {
  format: typeof EXPORT_FORMAT;
  version: 1;
  kdf: { name: 'PBKDF2-SHA256'; iterations: number; salt: string };
  cipher: { name: 'AES-256-GCM'; nonce: string };
  /** Base64 ciphertext with the 16-byte GCM tag appended. */
  data: string;
}

export class WrongPasswordError extends Error {
  constructor() {
    super('The password is wrong, or the file has been changed.');
    this.name = 'WrongPasswordError';
  }
}

/** Rejects passwords that are too short or trivially guessable; not a full strength meter. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (new Set(password.toLowerCase()).size < 5) return 'Too predictable: use a mix of different characters.';
  if (isSimpleRun(password.toLowerCase())) return 'Too predictable: avoid sequences like 1234 or abcd.';
  return null;
}

/** Every character one step from the last, e.g. "1234567890" or "abcdefghij" (either direction). */
function isSimpleRun(p: string): boolean {
  let up = true;
  let down = true;
  for (let i = 1; i < p.length; i++) {
    const d = p.charCodeAt(i) - p.charCodeAt(i - 1);
    if (d !== 1 && !(p[i - 1] === '9' && p[i] === '0')) up = false;
    if (d !== -1 && !(p[i - 1] === '0' && p[i] === '9')) down = false;
  }
  return up || down;
}

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Base64 without btoa/Buffer, so it behaves the same in Hermes and Node. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + B64[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + '==';
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]! + B64[(n >> 6) & 63]! + '=';
  }
  return out;
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (B64.indexOf(clean[i]!) << 18) |
      (B64.indexOf(clean[i + 1] ?? 'A') << 12) |
      (B64.indexOf(clean[i + 2] ?? 'A') << 6) |
      B64.indexOf(clean[i + 3] ?? 'A');
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

function header(file: Pick<EncryptedExport, 'format' | 'version' | 'kdf' | 'cipher'>): Uint8Array {
  return utf8.encode(JSON.stringify({ format: file.format, version: file.version, kdf: file.kdf, cipher: file.cipher }));
}

function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  // asyncTick lets the UI breathe during the (deliberately slow) derivation.
  return pbkdf2Async(sha256, utf8.encode(password), salt, { c: iterations, dkLen: 32, asyncTick: 25 });
}

export async function encryptExport(
  plaintext: string,
  password: string,
  random: (n: number) => Uint8Array,
  iterations = DEFAULT_ITERATIONS,
): Promise<EncryptedExport> {
  const problem = passwordProblem(password);
  if (problem) throw new Error(problem);
  const salt = random(16);
  const nonce = random(12);
  const meta = {
    format: EXPORT_FORMAT as typeof EXPORT_FORMAT,
    version: 1 as const,
    kdf: { name: 'PBKDF2-SHA256' as const, iterations, salt: toBase64(salt) },
    cipher: { name: 'AES-256-GCM' as const, nonce: toBase64(nonce) },
  };
  const key = await deriveKey(password, salt, iterations);
  const sealed = gcm(key, nonce, header(meta)).encrypt(utf8.encode(plaintext));
  return { ...meta, data: toBase64(sealed) };
}

export async function decryptExport(file: EncryptedExport, password: string): Promise<string> {
  if (file.format !== EXPORT_FORMAT || file.version !== 1) throw new Error('This is not a Social Graph export file.');
  if (file.kdf.name !== 'PBKDF2-SHA256' || file.cipher.name !== 'AES-256-GCM') throw new Error('Unsupported export file.');
  const key = await deriveKey(password, fromBase64(file.kdf.salt), file.kdf.iterations);
  try {
    const plain = gcm(key, fromBase64(file.cipher.nonce), header(file)).decrypt(fromBase64(file.data));
    return fromUtf8.decode(plain);
  } catch {
    throw new WrongPasswordError();
  }
}
