import { describe, expect, it } from 'vitest';
import * as Q from '../lib/jev/questions';

// Guards the API contract from docs.typesafe.ai/api: Score has 2-10 levels,
// Choice has 1-255 options, every question carries instructions.
describe('question definitions', () => {
  const all = [
    Q.skillPresence('Python', 'language'),
    Q.skillDepth('Python', 'language'),
    Q.skillImportance('Python', 'language'),
    Q.resumeSeniority(),
    Q.jobSeniority(),
    Q.isJobPosting(),
    Q.workOverlap(),
    Q.domainOverlap(),
    Q.dealbreaker(),
  ];

  it('all have instructions', () => {
    for (const q of all) expect(q.instructions).toBeTruthy();
  });

  it('score rubrics have 2 to 10 levels', () => {
    for (const q of all) if (q.type === 'score') expect(q.criteria.length).toBeGreaterThanOrEqual(2), expect(q.criteria.length).toBeLessThanOrEqual(10);
  });

  it('choice questions have 1 to 255 options', () => {
    for (const q of all) if (q.type === 'choice') {
      const n = Object.keys(q.criteria).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(255);
    }
  });

  it('weights sum to 1', () => {
    expect(Object.values(Q.WEIGHTS).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('verdicts cover the whole scale', () => {
    expect(Q.verdictFor(0)).toBe('Poor fit');
    expect(Q.verdictFor(10)).toBe('Made for you');
  });
});
