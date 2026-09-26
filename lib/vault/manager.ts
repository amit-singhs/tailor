/**
 * Background-only. Holds the unlocked API key.
 *
 * Where the key lives:
 *  - storage.local  : sealed (encrypted) form only. Survives restarts.
 *  - storage.session: the unlocked key, in memory only, cleared when the browser
 *    closes. Its default access level is TRUSTED_CONTEXTS, so content scripts
 *    (which run inside web pages) cannot read it. We set that explicitly too.
 *  - module memory  : a copy for speed while the service worker is alive.
 *
 * Auto-lock: after `autoLockMinutes` without use (sliding), or when the browser
 * closes. Unlock attempts are throttled after repeated failures.
 */
import { browser } from 'wxt/browser';
import { AppError, type Settings } from '../types';
import { open, passphraseProblem, seal, type SealedSecret } from './crypto';
import { ping } from '../jev/client';
import { FALLBACK_MODEL } from '../jev/questions';
import { setSettings } from '../settings';

const SEALED_KEY = 'vault.sealed';
const SESSION_KEY = 'vault.key';
const SESSION_EXPIRES = 'vault.expiresAt';
const SESSION_FAILS = 'vault.fails';
const SESSION_LOCKOUT = 'vault.lockoutUntil';
export const AUTOLOCK_ALARM = 'tailor-autolock';

const MAX_FAILS = 5;
const LOCKOUT_MS = 30_000;

let memoryKey: string | null = null;
let memoryExpiresAt: number | null = null;

export interface VaultStatus {
  configured: boolean;
  unlocked: boolean;
  hint: string | null;
  expiresAt: number | null;
}

export async function hardenSessionStorage(): Promise<void> {
  try {
    await browser.storage.session.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
  } catch {
    // Firefox: session storage is never exposed to content scripts.
  }
}

async function getSealed(): Promise<SealedSecret | null> {
  const r = await browser.storage.local.get(SEALED_KEY);
  return (r[SEALED_KEY] as SealedSecret | undefined) ?? null;
}

async function readSession(): Promise<{ key: string | null; expiresAt: number | null }> {
  if (memoryKey) return { key: memoryKey, expiresAt: memoryExpiresAt };
  const r = await browser.storage.session.get([SESSION_KEY, SESSION_EXPIRES]);
  const key = (r[SESSION_KEY] as string | undefined) ?? null;
  const expiresAt = (r[SESSION_EXPIRES] as number | null | undefined) ?? null;
  memoryKey = key;
  memoryExpiresAt = expiresAt;
  return { key, expiresAt };
}

async function writeSession(key: string, autoLockMinutes: number): Promise<void> {
  const expiresAt = autoLockMinutes > 0 ? Date.now() + autoLockMinutes * 60_000 : null;
  memoryKey = key;
  memoryExpiresAt = expiresAt;
  await browser.storage.session.set({ [SESSION_KEY]: key, [SESSION_EXPIRES]: expiresAt });
  await browser.alarms.clear(AUTOLOCK_ALARM);
  if (expiresAt) await browser.alarms.create(AUTOLOCK_ALARM, { when: expiresAt });
}

export async function status(): Promise<VaultStatus> {
  const sealed = await getSealed();
  if (!sealed) return { configured: false, unlocked: false, hint: null, expiresAt: null };
  const { key, expiresAt } = await readSession();
  const live = !!key && (expiresAt === null || expiresAt > Date.now());
  if (key && !live) await lock();
  return { configured: true, unlocked: live, hint: sealed.hint, expiresAt: live ? expiresAt : null };
}

export async function setup(apiKey: string, passphrase: string, settings: Settings): Promise<VaultStatus> {
  const key = apiKey.trim();
  if (key.length < 8 || /\s/.test(key)) throw new AppError('INVALID_INPUT', 'That does not look like a TypeSafe API key.');
  const problem = passphraseProblem(passphrase);
  if (problem) throw new AppError('INVALID_INPUT', problem);
  try {
    await ping(key, settings.model); // throws AUTH on a bad key
  } catch (err) {
    if (err instanceof AppError && err.code === 'AUTH') {
      throw new AppError('AUTH', 'TypeSafe rejected this key. Copy the whole key again from console.typesafe.ai/keys.');
    }
    // A retired pinned version shouldn't block setup: fall back to the alias.
    if (!(err instanceof AppError && err.code === 'UNKNOWN_MODEL') || settings.model === FALLBACK_MODEL) throw err;
    await ping(key, FALLBACK_MODEL);
    await setSettings({ model: FALLBACK_MODEL });
  }
  const sealed = await seal(key, passphrase);
  await browser.storage.local.set({ [SEALED_KEY]: sealed });
  await writeSession(key, settings.autoLockMinutes);
  await browser.storage.session.remove([SESSION_FAILS, SESSION_LOCKOUT]);
  return status();
}

export async function unlock(passphrase: string, settings: Settings): Promise<VaultStatus> {
  const sealed = await getSealed();
  if (!sealed) throw new AppError('NO_VAULT', 'No API key saved yet.');
  const s = await browser.storage.session.get([SESSION_FAILS, SESSION_LOCKOUT]);
  const lockoutUntil = (s[SESSION_LOCKOUT] as number | undefined) ?? 0;
  if (lockoutUntil > Date.now()) {
    throw new AppError('TOO_MANY_ATTEMPTS', 'Too many wrong passphrases. Wait a moment, then try again.', lockoutUntil - Date.now());
  }
  try {
    const key = await open(sealed, passphrase);
    await browser.storage.session.remove([SESSION_FAILS, SESSION_LOCKOUT]);
    await writeSession(key, settings.autoLockMinutes);
    return status();
  } catch (err) {
    const fails = ((s[SESSION_FAILS] as number | undefined) ?? 0) + 1;
    const patch: Record<string, number> = { [SESSION_FAILS]: fails };
    if (fails >= MAX_FAILS) {
      patch[SESSION_LOCKOUT] = Date.now() + LOCKOUT_MS;
      patch[SESSION_FAILS] = 0;
    }
    await browser.storage.session.set(patch);
    throw err;
  }
}

export async function lock(): Promise<void> {
  memoryKey = null;
  memoryExpiresAt = null;
  await browser.storage.session.remove([SESSION_KEY, SESSION_EXPIRES]);
  await browser.alarms.clear(AUTOLOCK_ALARM);
}

export async function forget(): Promise<void> {
  await lock();
  await browser.storage.local.remove(SEALED_KEY);
}

/** Returns the unlocked key and slides the auto-lock window forward. */
export async function useKey(settings: Settings): Promise<string> {
  const st = await status();
  if (!st.configured) throw new AppError('NO_VAULT', 'Add your TypeSafe API key first.');
  if (!st.unlocked || !memoryKey) throw new AppError('LOCKED', 'Tailor is locked. Enter your passphrase to continue.');
  const key = memoryKey;
  if (settings.autoLockMinutes > 0) await writeSession(key, settings.autoLockMinutes);
  return key;
}

/** Re-applies the auto-lock window after the setting changes. */
export async function reapplyAutoLock(settings: Settings): Promise<void> {
  const st = await status();
  if (st.unlocked && memoryKey) await writeSession(memoryKey, settings.autoLockMinutes);
}
