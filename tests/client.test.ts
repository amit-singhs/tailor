import { afterEach, describe, expect, it, vi } from 'vitest';
import { ask, ping } from '../lib/jev/client';
import { DEFAULT_MODEL } from '../lib/jev/questions';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

afterEach(() => vi.unstubAllGlobals());

describe('Jev client over HTTP', () => {
  it('uses the documented model id', () => {
    expect(DEFAULT_MODEL).toBe('jev-1.13.0');
  });

  it('sends a documented request body to /v1/systemone', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return json(200, {
        model: body.model,
        answers: { ok: { type: 'noul', noul: 0.9 } },
        usage: { input_tokens: 10, output_tokens: 1 },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    await ping('ts_test_key_123', DEFAULT_MODEL);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    const body = JSON.parse(String(init!.body));
    expect(body.model).toBe('jev-1.13.0');
    expect(body.state).toEqual(expect.any(String));
    expect(body.questions.ok.type).toBe('noul');
    expect(new Headers(init!.headers).get('authorization')).toContain('ts_test_key_123');
  });

  it('turns "Unknown model" into a clear, fixable error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(400, { detail: { error_type: 'api_usage_error', message: 'Unknown model: jev-x' } })));
    await expect(ping('k', 'jev-x')).rejects.toMatchObject({ code: 'UNKNOWN_MODEL' });
  });

  it('maps a rejected key to AUTH', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, { detail: 'Invalid API key' })));
    await expect(ping('bad', DEFAULT_MODEL)).rejects.toMatchObject({ code: 'AUTH' });
  });

  it('splits large question sets and merges answers', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const answers = Object.fromEntries(Object.keys(body.questions).map((k) => [k, { type: 'noul', noul: 0.5 }]));
      return json(200, { model: body.model, answers, usage: { input_tokens: 1, output_tokens: 1 } });
    });
    vi.stubGlobal('fetch', fetchMock);
    const questions = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`q${i}`, { type: 'noul' as const, instructions: 'x?' }]));
    const out = await ask('state', questions, { apiKey: 'k', model: DEFAULT_MODEL });
    expect(Object.keys(out)).toHaveLength(65);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
