/**
 * Thin wrapper around the official TypeSafe SDK (@typesafe-ai/sdk).
 *
 * Runs ONLY in the background service worker, the one context that ever holds
 * the decrypted API key. Adds three things on top of the SDK:
 *  - splits very large question sets into parallel requests (answers merged by id),
 *  - maps SDK errors to Tailor's error codes with user-facing messages,
 *  - validates that every requested answer came back with the expected type.
 * Retries for 408/429/5xx (including TypeSafe's 529 Overloaded) are the SDK's own.
 */
import {
  APIConnectionError,
  APIError,
  APITimeoutError,
  APIUserAbortError,
  AuthenticationError,
  PermissionDeniedError,
  RateLimitError,
  TypeSafeClient,
  UnprocessableEntityError,
  type EntryType,
  type Question,
} from '@typesafe-ai/sdk';
import { AppError } from '../types';
import { DEFAULT_MODEL, FALLBACK_MODEL, LIMITS } from './questions';

export interface NoulAnswer {
  type: 'noul';
  noul: number;
}
export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
}
export interface ScoreAnswer {
  type: 'score';
  score: number;
  confidence: number;
  legend: Record<string, EntryType>;
  probabilities: Record<string, number>;
}
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export interface AskOptions {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

function makeClient(apiKey: string, model: string): TypeSafeClient {
  return new TypeSafeClient({
    apiKey,
    defaultModel: model,
    timeout: LIMITS.timeoutMs,
    retry: { maxRetries: LIMITS.maxRetries },
    logLevel: 'off',
    // Chrome runs this in a service worker (no `window`), so the SDK's browser
    // guard never triggers there. Firefox MV3 runs background scripts in an
    // event page that has `window`. In both cases this is the extension's own
    // isolated background context, never a web page: pages and content scripts
    // cannot read its memory, so the SDK's concern (exposing a server key to
    // page visitors) does not apply. The key is the user's own.
    dangerouslyAllowBrowser: import.meta.env.FIREFOX,
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Ask any number of questions against one state. Questions are evaluated
 * independently by Jev, so splitting them across requests changes nothing
 * about the answers; it only keeps each request a comfortable size.
 */
export async function ask(
  state: EntryType,
  questions: Record<string, Question>,
  opts: AskOptions,
): Promise<Record<string, Answer>> {
  const entries = Object.entries(questions);
  if (entries.length === 0) return {};
  const client = makeClient(opts.apiKey, opts.model);
  const batches = chunk(entries, LIMITS.questionsPerRequest);

  try {
    const parts = await mapLimit(batches, LIMITS.concurrency, async (batch) => {
      const res = await client.systemOne(
        { state, questions: Object.fromEntries(batch), model: opts.model },
        { signal: opts.signal },
      );
      return res.answers as unknown as Record<string, Answer>;
    });
    const merged: Record<string, Answer> = Object.assign({}, ...parts);
    for (const [id, q] of entries) {
      const a = merged[id];
      if (!a || a.type !== q.type) {
        throw new AppError('BAD_RESPONSE', 'Jev returned an unexpected answer. Try again, or pick a different model in Settings.');
      }
    }
    return merged;
  } catch (err) {
    if (err instanceof APIError && err.status < 500 && /unknown model/i.test(describeBody(err.body))) {
      throw new AppError('UNKNOWN_MODEL', `TypeSafe doesn't recognize the model "${opts.model}". In Settings, use ${DEFAULT_MODEL} or ${FALLBACK_MODEL}.`);
    }
    throw toAppError(err);
  }
}

/** Cheapest possible call, used to check a new API key before saving it. */
export async function ping(apiKey: string, model: string): Promise<void> {
  await ask('Tailor key check.', { ok: { type: 'noul', instructions: 'Is this a short test message?' } }, { apiKey, model });
}

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    return new AppError('AUTH', 'TypeSafe rejected the API key. Check it in the TypeSafe console, then replace it in Settings.');
  }
  if (err instanceof RateLimitError) {
    return new AppError('RATE_LIMIT', 'TypeSafe rate limit reached. Wait a moment, then measure again.', err.retryAfterMs);
  }
  if (err instanceof UnprocessableEntityError) {
    return new AppError('BAD_REQUEST', `TypeSafe could not process the request: ${describeBody(err.body)}. If you changed the model in Settings, check its name.`);
  }
  if (err instanceof APIError) {
    if (err.status === 529 || err.status >= 500) {
      return new AppError('OVERLOADED', 'TypeSafe is busy right now. Measure again in a few seconds.');
    }
    if (err.status === 404) {
      return new AppError('BAD_REQUEST', 'TypeSafe did not recognize the request. Check the model name in Settings.');
    }
    return new AppError('BAD_REQUEST', `TypeSafe returned an error (${err.status}): ${describeBody(err.body)}`);
  }
  if (err instanceof APITimeoutError) {
    return new AppError('TIMEOUT', 'TypeSafe took too long to answer. Check your connection and measure again.');
  }
  if (err instanceof APIConnectionError) {
    return new AppError('NETWORK', 'Could not reach TypeSafe. Check your internet connection.');
  }
  if (err instanceof APIUserAbortError) {
    return new AppError('UNKNOWN', 'Cancelled.');
  }
  return new AppError('UNKNOWN', err instanceof Error ? err.message : 'Something went wrong.');
}

function describeBody(body: unknown): string {
  if (!body) return 'no details';
  if (typeof body === 'string') return body.slice(0, 200);
  try {
    return JSON.stringify(body).slice(0, 200);
  } catch {
    return 'no details';
  }
}
