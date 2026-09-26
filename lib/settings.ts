import { browser } from 'wxt/browser';
import { DEFAULT_MODEL } from './jev/questions';
import type { Settings } from './types';

const KEY = 'settings';

export const DEFAULT_SETTINGS: Settings = {
  model: DEFAULT_MODEL,
  autoLockMinutes: 30,
};

/** Model names saved by earlier versions that TypeSafe does not accept. */
const RENAMED_MODELS: Record<string, string> = { 'jev-1.13': DEFAULT_MODEL };

export async function getSettings(): Promise<Settings> {
  const r = await browser.storage.local.get(KEY);
  const s = { ...DEFAULT_SETTINGS, ...((r[KEY] as Partial<Settings> | undefined) ?? {}) };
  s.model = RENAMED_MODELS[s.model] ?? s.model;
  return s;
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  next.model = next.model.trim() || DEFAULT_MODEL;
  next.autoLockMinutes = Math.max(0, Math.min(24 * 60, Math.round(next.autoLockMinutes)));
  await browser.storage.local.set({ [KEY]: next });
  return next;
}

/** Small UI preferences that are not secrets. */
const ACTIVE_RESUME = 'ui.activeResumeId';

export async function getActiveResumeId(): Promise<string | null> {
  const r = await browser.storage.local.get(ACTIVE_RESUME);
  return (r[ACTIVE_RESUME] as string | undefined) ?? null;
}

export async function setActiveResumeId(id: string | null): Promise<void> {
  if (id) await browser.storage.local.set({ [ACTIVE_RESUME]: id });
  else await browser.storage.local.remove(ACTIVE_RESUME);
}
