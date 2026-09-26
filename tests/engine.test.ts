import { describe, expect, it } from 'vitest';
import { combine, compose, fitSkill, seniorityFit, skillCoverage, skillMatch, tierFor } from '../lib/scoring/engine';
import type { JudgedScore } from '../lib/types';

const imp = (score: number, confidence = 0.9): JudgedScore => ({ score, max: 3, confidence });
const dep = (score: number, confidence = 0.9): JudgedScore => ({ score, max: 4, confidence });

describe('skill match', () => {
  it('is full when depth meets the target for a core requirement', () => {
    expect(skillMatch(1, 0.75)).toBe(1);
    expect(skillMatch(1, 1)).toBe(1);
  });
  it('asks less depth of nice-to-have skills', () => {
    expect(skillMatch(1 / 3, 0.5)).toBe(1);
    expect(skillMatch(1, 0.5)).toBeCloseTo(0.667, 2);
  });
  it('is zero with no evidence', () => {
    expect(skillMatch(1, 0)).toBe(0);
  });
});

describe('tiers', () => {
  it('marks unrequested skills as not needed', () => {
    expect(tierFor(0.1, 1)).toBe('not-needed');
  });
  it('splits strong, partial, missing', () => {
    expect(tierFor(1, 0.9)).toBe('strong');
    expect(tierFor(1, 0.5)).toBe('partial');
    expect(tierFor(1, 0.1)).toBe('missing');
  });
});

describe('fitSkill', () => {
  it('scores 0-10 and labels levels', () => {
    const f = fitSkill({ id: 'python', name: 'Python', category: 'language', inResume: true, importance: imp(3), depth: dep(3) });
    expect(f.score).toBe(10);
    expect(f.tier).toBe('strong');
    expect(f.importanceLabel).toBe('Core requirement');
    expect(f.depthLabel).toBe('Heavy use');
  });
  it('flags low-confidence answers', () => {
    const f = fitSkill({ id: 'x', name: 'X', category: 'other', inResume: true, importance: imp(2, 0.2), depth: dep(2) });
    expect(f.uncertain).toBe(true);
  });
});

describe('coverage', () => {
  it('weights by importance and ignores unneeded skills', () => {
    const a = fitSkill({ id: 'a', name: 'A', category: 'other', inResume: true, importance: imp(3), depth: dep(4) });
    const b = fitSkill({ id: 'b', name: 'B', category: 'other', inResume: false, importance: imp(3), depth: dep(0) });
    const c = fitSkill({ id: 'c', name: 'C', category: 'other', inResume: true, importance: imp(0), depth: dep(4) });
    expect(skillCoverage([a, b, c])).toBeCloseTo(0.5, 5);
  });
  it('is null when the job asks for none of the skills', () => {
    const c = fitSkill({ id: 'c', name: 'C', category: 'other', inResume: true, importance: imp(0), depth: dep(4) });
    expect(skillCoverage([c])).toBeNull();
  });
});

describe('seniority', () => {
  const ch = (choice: 'entry' | 'mid' | 'senior' | 'lead' | 'unclear', confidence = 0.9) => ({ choice, confidence, probabilities: {} });
  it('is 1 at the same level and drops below the bar', () => {
    expect(seniorityFit(ch('senior'), ch('senior'))).toBe(1);
    expect(seniorityFit(ch('senior'), ch('mid'))).toBe(0.55);
    expect(seniorityFit(ch('lead'), ch('entry'))).toBe(0);
  });
  it('is unknown when unclear or unsure', () => {
    expect(seniorityFit(ch('unclear'), ch('mid'))).toBeNull();
    expect(seniorityFit(ch('mid', 0.1), ch('mid'))).toBeNull();
  });
});

describe('combine', () => {
  it('re-weights when a component is missing', () => {
    expect(
      combine([
        { key: 'skills', label: '', value: 1, weight: 0.5 },
        { key: 'work', label: '', value: 0, weight: 0.5 },
        { key: 'seniority', label: '', value: null, weight: 0.5 },
      ]),
    ).toBeCloseTo(0.5, 5);
  });
});

describe('compose', () => {
  const base = {
    jobHash: 'j',
    jobTitle: 'Backend Engineer',
    resumeId: 'r',
    resumeLabel: 'Backend',
    model: 'jev-1.13.0',
    work: { score: 4, max: 4, confidence: 0.9 },
    domain: { score: 3, max: 3, confidence: 0.9 },
    dealbreaker: 0.05,
    jobSeniority: { choice: 'senior' as const, confidence: 0.9, probabilities: {} },
    resumeSeniority: { choice: 'senior' as const, confidence: 0.9, probabilities: {} },
  };

  it('gives a perfect match a 10', () => {
    const r = compose({
      ...base,
      skills: [{ id: 'py', name: 'Python', category: 'language', inResume: true, importance: imp(3), depth: dep(4) }],
    });
    expect(r.overall).toBe(10);
  });

  it('drops job-only skills the job does not need, keeps resume skills', () => {
    const r = compose({
      ...base,
      skills: [
        { id: 'py', name: 'Python', category: 'language', inResume: true, importance: imp(0), depth: dep(4) },
        { id: 'go', name: 'Go', category: 'language', inResume: false, importance: imp(0), depth: dep(0) },
      ],
    });
    expect(r.skills.map((s) => s.id)).toEqual(['py']);
    expect(r.skills[0]!.tier).toBe('not-needed');
  });

  it('caps the score when a dealbreaker is flagged', () => {
    const r = compose({
      ...base,
      dealbreaker: 0.9,
      skills: [{ id: 'py', name: 'Python', category: 'language', inResume: true, importance: imp(3), depth: dep(4) }],
    });
    expect(r.overall).toBe(5);
    expect(r.dealbreaker.capped).toBe(true);
  });

  it('stays within 0..10', () => {
    const r = compose({
      ...base,
      work: { score: 0, max: 4, confidence: 0.9 },
      domain: { score: 0, max: 3, confidence: 0.9 },
      skills: [{ id: 'k8s', name: 'Kubernetes', category: 'devops', inResume: false, importance: imp(3), depth: dep(0) }],
    });
    expect(r.overall).toBeGreaterThanOrEqual(0);
    expect(r.overall).toBeLessThanOrEqual(10);
  });
});
