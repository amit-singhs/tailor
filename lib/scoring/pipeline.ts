/**
 * Background-only orchestration: decides which Jev questions still need asking,
 * asks them (in parallel, independent requests), caches the typed answers, and
 * hands everything to the pure engine.
 *
 * Three independent requests, each with only the state its questions need
 * (TypeSafe: large, irrelevant state costs accuracy):
 *   job      state = job text           -> importance per skill, job seniority, is-a-job guard
 *   resume   state = resume text        -> depth per skill, resume seniority      (cached per resume)
 *   holistic state = { job, resume }    -> day-to-day work, domain, dealbreaker   (cached per pair)
 */
import type { Question } from '@typesafe-ai/sdk';
import { ask, type Answer, type ChoiceAnswer, type NoulAnswer, type ScoreAnswer } from '../jev/client';
import * as Q from '../jev/questions';
import { LIMITS, THRESHOLDS } from '../jev/questions';
import { db, pruneCaches, type DepthCache, type HolisticCache, type JobCache } from '../db';
import { findTaxonomySkills } from '../skills/find';
import { clip, stripBoilerplate } from '../text';
import {
  AppError,
  type FitResult,
  type JobPosting,
  type JudgedChoice,
  type JudgedScore,
  type Resume,
  type Seniority,
  type SkillCandidate,
  type SkillCategory,
} from '../types';
import { compose, type SkillInput } from './engine';

interface Ctx {
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

const asScore = (a: Answer | undefined, levels: number): JudgedScore => {
  const s = a as ScoreAnswer;
  return { score: s.score, max: levels - 1, confidence: s.confidence };
};
const asChoice = <T extends string>(a: Answer | undefined): JudgedChoice<T> => {
  const c = a as ChoiceAnswer;
  return { choice: c.choice as T, confidence: c.confidence, probabilities: c.probabilities };
};
const asNoul = (a: Answer | undefined): number => (a as NoulAnswer).noul;

export function prepareResumeText(text: string): string {
  return clip(text, LIMITS.maxResumeChars);
}

export function prepareJobText(text: string): string {
  return clip(stripBoilerplate(text), LIMITS.maxJobChars);
}

/** Resume import: which found candidates really are this person's skills. */
export async function verifySkills(
  text: string,
  candidates: SkillCandidate[],
  ctx: Ctx,
): Promise<Record<string, number>> {
  if (candidates.length === 0) return {};
  const questions: Record<string, Question> = {};
  candidates.forEach((c, i) => (questions[`has_${i}`] = Q.skillPresence(c.name, c.category)));
  const answers = await ask(prepareResumeText(text), questions, ctx);
  const out: Record<string, number> = {};
  candidates.forEach((c, i) => (out[c.id] = asNoul(answers[`has_${i}`])));
  return out;
}

interface SkillRef {
  id: string;
  name: string;
  category: SkillCategory;
  inResume: boolean;
}

function collectSkills(resume: Resume, jobText: string): SkillRef[] {
  const refs = new Map<string, SkillRef>();
  for (const s of resume.skills) refs.set(s.id, { id: s.id, name: s.name, category: s.category, inResume: true });
  let jobOnly = 0;
  for (const c of findTaxonomySkills(jobText)) {
    if (refs.has(c.id)) continue;
    if (jobOnly++ >= LIMITS.maxJobOnlySkills) break;
    refs.set(c.id, { id: c.id, name: c.name, category: c.category, inResume: false });
  }
  return [...refs.values()];
}

async function jobSide(job: JobPosting, jobText: string, skills: SkillRef[], ctx: Ctx, force: boolean): Promise<JobCache> {
  const d = await db();
  const key = `${job.hash}|${ctx.model}`;
  const cached = force ? undefined : await d.get('jobs', key);
  const importance = { ...(cached?.importance ?? {}) };
  const missing = skills.filter((s) => !importance[s.id]);
  const needMeta = !cached?.seniority || cached.isJob === undefined;
  if (missing.length === 0 && !needMeta) return cached!;

  const questions: Record<string, Question> = {};
  missing.forEach((s, i) => (questions[`imp_${i}`] = Q.skillImportance(s.name, s.category)));
  if (needMeta) {
    questions.job_seniority = Q.jobSeniority();
    questions.is_job = Q.isJobPosting();
  }
  const a = await ask(jobText, questions, ctx);
  missing.forEach((s, i) => (importance[s.id] = asScore(a[`imp_${i}`], Q.IMPORTANCE_LEVELS.length)));
  const next: JobCache = {
    key,
    importance,
    seniority: needMeta ? asChoice<Seniority>(a.job_seniority) : cached!.seniority,
    isJob: needMeta ? asNoul(a.is_job) : cached!.isJob,
    updatedAt: Date.now(),
  };
  await d.put('jobs', next);
  return next;
}

async function resumeSide(resume: Resume, resumeText: string, skills: SkillRef[], ctx: Ctx, force: boolean): Promise<DepthCache> {
  const d = await db();
  const key = `${resume.textHash}|${ctx.model}`;
  const cached = force ? undefined : await d.get('depth', key);
  const depth = { ...(cached?.depth ?? {}) };
  const missing = skills.filter((s) => !depth[s.id]);
  const needSeniority = !cached?.seniority;
  if (missing.length === 0 && !needSeniority) return cached!;

  const questions: Record<string, Question> = {};
  missing.forEach((s, i) => (questions[`depth_${i}`] = Q.skillDepth(s.name, s.category)));
  if (needSeniority) questions.resume_seniority = Q.resumeSeniority();
  const a = await ask(resumeText, questions, ctx);
  missing.forEach((s, i) => (depth[s.id] = asScore(a[`depth_${i}`], Q.DEPTH_LEVELS.length)));
  const next: DepthCache = {
    key,
    depth,
    seniority: needSeniority ? asChoice<Seniority>(a.resume_seniority) : cached!.seniority,
    updatedAt: Date.now(),
  };
  await d.put('depth', next);
  return next;
}

async function holisticSide(job: JobPosting, jobText: string, resume: Resume, resumeText: string, ctx: Ctx, force: boolean): Promise<HolisticCache> {
  const d = await db();
  const key = `${job.hash}|${resume.textHash}|${ctx.model}`;
  const cached = force ? undefined : await d.get('holistic', key);
  if (cached) return cached;
  const a = await ask(
    { job: jobText, resume: resumeText },
    { work: Q.workOverlap(), domain: Q.domainOverlap(), dealbreaker: Q.dealbreaker() },
    ctx,
  );
  const next: HolisticCache = {
    key,
    work: asScore(a.work, Q.WORK_LEVELS.length),
    domain: asScore(a.domain, Q.DOMAIN_LEVELS.length),
    dealbreaker: asNoul(a.dealbreaker),
    updatedAt: Date.now(),
  };
  await d.put('holistic', next);
  return next;
}

export async function scoreFit(job: JobPosting, resume: Resume, ctx: Ctx, force = false): Promise<FitResult> {
  if (resume.skills.length === 0) {
    throw new AppError('INVALID_INPUT', `"${resume.label}" has no skills yet. Add a few in Resumes, then measure again.`);
  }
  const jobText = prepareJobText(job.text);
  const resumeText = prepareResumeText(resume.text);
  const skills = collectSkills(resume, jobText);

  const [jobC, resC, hol] = await Promise.all([
    jobSide(job, jobText, skills, ctx, force),
    resumeSide(resume, resumeText, skills, ctx, force),
    holisticSide(job, jobText, resume, resumeText, ctx, force),
  ]);
  void pruneCaches().catch(() => {});

  if (job.source !== 'selection' && (jobC.isJob ?? 1) < THRESHOLDS.notAJob) {
    throw new AppError(
      'NOT_A_JOB',
      'This page does not look like a single job posting. Open one job, or select its description text and measure again.',
    );
  }

  const inputs: SkillInput[] = skills.map((s) => ({
    ...s,
    importance: jobC.importance[s.id]!,
    depth: resC.depth[s.id]!,
  }));

  return compose({
    jobHash: job.hash,
    jobTitle: job.title,
    resumeId: resume.id,
    resumeLabel: resume.label,
    model: ctx.model,
    skills: inputs,
    work: hol.work,
    domain: hol.domain,
    dealbreaker: hol.dealbreaker,
    jobSeniority: jobC.seniority,
    resumeSeniority: resC.seniority,
  });
}
