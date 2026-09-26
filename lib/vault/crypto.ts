/**
 * Seals the API key with a passphrase. Only the sealed form ever touches disk.
 *
 * - Key derivation: PBKDF2-HMAC-SHA256, 600,000 iterations (OWASP 2023 guidance),
 *   random 16-byte salt per seal.
 * - Encryption: AES-256-GCM with a random 12-byte IV. GCM authenticates the
 *   ciphertext, so a wrong passphrase or tampered data fails to open.
 * - All primitives come from the browser's WebCrypto; no third-party crypto code.
 */
import { AppError } from '../types';

export const PBKDF2_ITERATIONS = 600_000;

export interface SealedSecret {
  v: 1;
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
  /** Last 4 characters, so you can tell which key is stored. */
  hint: string;
  createdAt: number;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', enc.encode(passphrase.normalize('NFKC')), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function seal(secret: string, passphrase: string, iterations = PBKDF2_ITERATIONS): Promise<SealedSecret> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, iterations);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(secret)));
  return {
    v: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ct),
    hint: secret.slice(-4),
    createdAt: Date.now(),
  };
}

export async function open(sealed: SealedSecret, passphrase: string): Promise<string> {
  if (sealed.v !== 1 || sealed.kdf !== 'PBKDF2-SHA256') {
    throw new AppError('UNKNOWN', 'The saved key uses an unknown format. Replace the key in Settings.');
  }
  const key = await deriveKey(passphrase, fromB64(sealed.salt), sealed.iterations);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(sealed.iv) }, key, fromB64(sealed.ciphertext));
    return dec.decode(pt);
  } catch {
    throw new AppError('BAD_PASSPHRASE', 'That passphrase does not unlock the saved key.');
  }
}

export const MIN_PASSPHRASE_LENGTH = 8;

export function passphraseProblem(passphrase: string): string | null {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) return `Use at least ${MIN_PASSPHRASE_LENGTH} characters.`;
  if (/^(.)\1+$/.test(passphrase)) return 'Use more than one repeated character.';
  return null;
}
