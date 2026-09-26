import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '@typesafe-ai/sdk';

const calls: Array<{ state: unknown; questions: Record<string, Question> }> = [];

vi.mock('../lib/jev/client', () => ({
  ask: vi.fn(async (state: unknown, questions: Record<string, Question>) => {
    calls.push({ state, questions });
    const out: Record<string, unknown> = {};
    for (const [id, q] of Object.entries(questions)) {
      if (q.type === 'noul') out[id] = { type: 'noul', noul: id === 'dealbreaker' ? 0.05 : 0.95 };
      if (q.type === 'choice') out[id] = { type: 'choice', choice: 'senior', confidence: 0.9, probabilities: { senior: 0.9 } };
      if (q.type === 'score') {
        const top = q.criteria.length - 1;
        out[id] = { type: 'score', score: top, confidence: 0.9, legend: {}, probabilities: {} };
      }
    }
    return out;
  }),
}));

const { scoreFit, verifySkills } = await import('../lib/scoring/pipeline');
const { clearCaches } = await import('../lib/db');

const resume = {
  id: 'r1',
  label: 'Backend',
  text: 'Senior engineer. Built services in Python and Go on AWS for five years.',
  textHash: 'resumehash',
  skills: [
    { id: 'python', name: 'Python', category: 'language' as const, source: 'taxonomy' as const, presence: 0.99 },
    { id: 'go', name: 'Go', category: 'language' as const, source: 'taxonomy' as const, presence: 0.97 },
  ],
  createdAt: 0,
  updatedAt: 0,
};

const job = {
  url: 'https://example.com/job',
  title: 'Senior Backend Engineer',
  text: 'We need a senior backend engineer. Requirements: Python, Kubernetes, PostgreSQL. You will build APIs.',
  source: 'heuristic' as const,
  hash: 'jobhash',
};

const ctx = { apiKey: 'k', model: 'jev-1.13.0' };

beforeEach(async () => {
  calls.length = 0;
  await clearCaches();
});

describe('scoreFit pipeline', () => {
  it('asks three focused requests with the right state', async () => {
    const r = await scoreFit(job, resume, ctx);
    expect(calls).toHaveLength(3);
    const [jobCall, resumeCall, holCall] = calls;
    expect(typeof jobCall!.state).toBe('string');
    expect(jobCall!.state).toContain('Kubernetes');
    expect(Object.keys(jobCall!.questions)).toEqual(expect.arrayContaining(['job_seniority', 'is_job', 'imp_0']));
    expect(resumeCall!.state).toBe(resume.text);
    expect(Object.keys(resumeCall!.questions)).toContain('resume_seniority');
    expect(holCall!.state).toEqual({ job: expect.any(String), resume: resume.text });
    // Resume skills plus job-only skills found by code.
    const names = r.skills.map((s) => s.name);
    expect(names).toEqual(expect.arrayContaining(['Python', 'Go', 'Kubernetes', 'PostgreSQL']));
    expect(r.overall).toBe(10);
  });

  it('reuses cached answers on the next measure', async () => {
    await scoreFit(job, resume, ctx);
    calls.length = 0;
    await scoreFit(job, resume, ctx);
    expect(calls).toHaveLength(0);
  });

  it('only asks about new skills when the resume changes its list', async () => {
    await scoreFit(job, resume, ctx);
    calls.length = 0;
    const more = { ...resume, skills: [...resume.skills, { id: 'rust', name: 'Rust', category: 'language' as const, source: 'user' as const, presence: null }] };
    await scoreFit(job, more, ctx);
    const asked = calls.flatMap((c) => Object.keys(c.questions));
    expect(asked).toEqual(['imp_0', 'depth_0']);
  });

  it('re-asks everything when forced', async () => {
    await scoreFit(job, resume, ctx);
    calls.length = 0;
    await scoreFit(job, resume, ctx, true);
    expect(calls).toHaveLength(3);
  });

  it('refuses a resume with no skills', async () => {
    await expect(scoreFit(job, { ...resume, skills: [] }, ctx)).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

describe('verifySkills', () => {
  it('returns one probability per candidate', async () => {
    const out = await verifySkills(
      resume.text,
      [
        { id: 'python', name: 'Python', category: 'language', source: 'taxonomy' },
        { id: 'go', name: 'Go', category: 'language', source: 'taxonomy' },
      ],
      ctx,
    );
    expect(out).toEqual({ python: 0.95, go: 0.95 });
    expect(Object.values(calls[0]!.questions).every((q) => q.type === 'noul')).toBe(true);
  });
});
