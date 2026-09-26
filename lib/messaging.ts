/**
 * Typed request/response messaging between the side panel and the background.
 * The API key never crosses this boundary: the panel sends work, the
 * background does the Jev call and returns only results.
 */
import { browser } from 'wxt/browser';
import type { VaultStatus } from './vault/manager';
import { AppError, type AppErrorShape, type FitResult, type JobPosting, type Settings, type SkillCandidate } from './types';

export interface CompareRow {
  resumeId: string;
  label: string;
  overall: number | null;
  error?: AppErrorShape;
}

export interface Api {
  'vault/status': { req: void; res: VaultStatus };
  'vault/setup': { req: { apiKey: string; passphrase: string }; res: VaultStatus };
  'vault/unlock': { req: { passphrase: string }; res: VaultStatus };
  'vault/lock': { req: void; res: VaultStatus };
  'vault/forget': { req: void; res: VaultStatus };
  'skills/verify': { req: { text: string; candidates: SkillCandidate[] }; res: Record<string, number> };
  'fit/score': { req: { job: JobPosting; resumeId: string; force?: boolean }; res: FitResult };
  'fit/compare': { req: { job: JobPosting }; res: CompareRow[] };
  'settings/get': { req: void; res: Settings };
  'settings/set': { req: Partial<Settings>; res: Settings };
  'cache/clear': { req: void; res: void };
}

export type ApiType = keyof Api;

interface Envelope<T extends ApiType = ApiType> {
  __tailor: 1;
  type: T;
  payload: Api[T]['req'];
}

type Reply<T> = { ok: true; data: T } | { ok: false; error: AppErrorShape };

export async function send<T extends ApiType>(
  type: T,
  ...payload: Api[T]['req'] extends void ? [] : [Api[T]['req']]
): Promise<Api[T]['res']> {
  const msg: Envelope<T> = { __tailor: 1, type, payload: payload[0] as Api[T]['req'] };
  let reply: Reply<Api[T]['res']> | undefined;
  try {
    reply = (await browser.runtime.sendMessage(msg)) as Reply<Api[T]['res']> | undefined;
  } catch {
    throw new AppError('UNKNOWN', 'Tailor’s background worker did not respond. Close and reopen the panel.');
  }
  if (!reply) throw new AppError('UNKNOWN', 'Tailor’s background worker did not respond. Close and reopen the panel.');
  if (!reply.ok) throw new AppError(reply.error.code, reply.error.message, reply.error.retryAfterMs);
  return reply.data;
}

export type Handlers = { [T in ApiType]: (payload: Api[T]['req']) => Promise<Api[T]['res']> };

/** Registers handlers. Only accepts messages from this extension's own pages. */
export function serve(handlers: Handlers): void {
  browser.runtime.onMessage.addListener((raw: unknown, sender, sendResponse) => {
    const msg = raw as Partial<Envelope> | null;
    if (!msg || msg.__tailor !== 1 || typeof msg.type !== 'string') return false;
    // Only Tailor's own extension pages may call this API. Content scripts run
    // inside web pages, so their sender URL is the page's, and they are refused.
    const origin = browser.runtime.getURL('/');
    if (sender.id !== browser.runtime.id || !sender.url?.startsWith(origin)) return false;
    const handler = handlers[msg.type as ApiType] as ((p: unknown) => Promise<unknown>) | undefined;
    if (!handler) return false;
    handler(msg.payload)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err: unknown) => {
        const e =
          err instanceof AppError
            ? err.toJSON()
            : { code: 'UNKNOWN' as const, message: err instanceof Error ? err.message : 'Something went wrong.' };
        sendResponse({ ok: false, error: e });
      });
    return true; // keep the channel open for the async reply
  });
}
