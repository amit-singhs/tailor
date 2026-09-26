/**
 * Every question Tailor asks Jev, plus every threshold and weight that turns the
 * answers into a score, lives in this one file.
 *
 * This follows TypeSafe's guidance: keep questions and threshold constants in a
 * single place so humans can review them. If a score looks wrong, start here.
 *
 * Design rules we follow (from docs.typesafe.ai):
 * - One narrow judgment per question; combine the answers in code.
 * - Question ids are for code only and are never sent to the model, so every
 *   question carries its full meaning in `instructions`.
 * - Data the question refers to goes in a named field and is referenced in
 *   backticks, e.g. `skill`.
 * - Arithmetic, counting and comparisons stay in code (lib/scoring/engine.ts).
 * - Score levels describe concrete situations that stand on their own.
 */
import { choice, noul, score } from '@typesafe-ai/sdk';
import type { Seniority, SkillCategory } from '../types';

/** Pinned so scores don't shift when `jev-latest` moves. Changeable in Settings. */
export const DEFAULT_MODEL = 'jev-1.13.0';
/** Alias that always exists; used as a fallback if the pinned version is retired. */
export const FALLBACK_MODEL = 'jev-latest';

export const LIMITS = {
  /** Questions per request. Large requests are split and run in parallel. */
  questionsPerRequest: 30,
  /** Parallel requests at most. */
  concurrency: 3,
  /** Resume text sent as state. Longer resumes are trimmed. */
  maxResumeChars: 16_000,
  /** Job text sent as state, after boilerplate is removed. */
  maxJobChars: 14_000,
  /** Job-only skills we ask about, beyond the resume's own skills. */
  maxJobOnlySkills: 60,
  /** Per-attempt timeout; the SDK retries 408/429/5xx with backoff. */
  timeoutMs: 20_000,
  maxRetries: 3,
} as const;

export const THRESHOLDS = {
  /** Keep a found skill when Jev's yes-probability is at least this. */
  skillPresent: 0.5,
  /** Below this normalized importance a skill is "not needed for this job". */
  relevantImportance: 0.2,
  /** Normalized importance at or above this counts as a real requirement. */
  requirement: 0.5,
  /** Skill match at or above this is "strong". */
  strongMatch: 0.75,
  /** Skill match at or above this is "partial"; below it is "missing". */
  partialMatch: 0.4,
  /** Choice/Score confidence below this marks an answer as uncertain. */
  lowConfidence: 0.45,
  /** Stop scoring when Jev's probability that the page is a job posting is below this. */
  notAJob: 0.35,
  /** Yes-probability at or above this flags a hard requirement the resume misses. */
  dealbreaker: 0.7,
  /** Overall score ceiling when a dealbreaker is flagged. */
  dealbreakerCap: 5,
} as const;

/** How the overall 0–10 score is composed. Missing components are left out and the rest re-weighted. */
export const WEIGHTS = {
  skills: 0.55,
  work: 0.25,
  domain: 0.1,
  seniority: 0.1,
} as const;

const CATEGORY_LABEL: Record<SkillCategory, string> = {
  language: 'programming language',
  frontend: 'frontend technology',
  backend: 'backend technology',
  data: 'data tool or technique',
  ml: 'machine learning or AI technology',
  cloud: 'cloud platform or service',
  devops: 'DevOps or infrastructure tool',
  database: 'database technology',
  mobile: 'mobile development technology',
  testing: 'testing tool or practice',
  security: 'security skill or tool',
  design: 'design skill or tool',
  product: 'product management skill',
  business: 'business or domain skill',
  practice: 'engineering practice or methodology',
  soft: 'interpersonal or leadership skill',
  other: 'professional skill, tool, or technology',
};

// ---------------------------------------------------------------------------
// Resume import: verify candidate skills found by code (state = resume text)
// ---------------------------------------------------------------------------

/**
 * Code over-finds candidate skills (taxonomy + skills-section scan); Jev keeps
 * the real ones. A Noul per candidate, because several skills can apply at once.
 */
export const skillPresence = (name: string, category: SkillCategory) =>
  noul(
    {
      skill: name,
      skill_kind: CATEGORY_LABEL[category],
      question:
        'Does the resume in the state show that this person knows or has worked with `skill`, a `skill_kind`?',
    },
    {
      true: 'The resume refers to `skill` as something this person has used, studied, or knows.',
      false:
        'The resume does not refer to `skill`, or the matching word means something else there (for example an ordinary English word or a different product with a similar name).',
    },
  );

// ---------------------------------------------------------------------------
// Resume side (state = resume text). Cached per resume text + model.
// ---------------------------------------------------------------------------

export const DEPTH_LEVELS = [
  'The resume does not mention this skill or anything that clearly implies it',
  'Mentioned or listed, with no detail on how it was used',
  'Used in some work or projects, with a few specifics',
  'Used heavily across multiple roles or projects',
  'Deep expertise: led, architected, or optimized significant work with it',
] as const;

export const DEPTH_SHORT = ['None', 'Listed', 'Some use', 'Heavy use', 'Deep expertise'] as const;

export const skillDepth = (name: string, category: SkillCategory) =>
  score(
    {
      skill: name,
      skill_kind: CATEGORY_LABEL[category],
      question: 'How much depth of experience with `skill`, a `skill_kind`, does the resume in the state show?',
    },
    DEPTH_LEVELS,
  );

const SENIORITY_OPTIONS = {
  entry: 'Entry level, graduate, or internship: little or no professional experience',
  mid: 'Mid level: a few years of experience, works independently',
  senior: 'Senior: many years of experience, owns significant work end to end',
  lead: 'Lead, staff, principal, or manager: sets direction for other people',
  unclear: 'The text does not make the level clear',
} as const satisfies Record<Seniority, string>;

export const resumeSeniority = () =>
  choice('What seniority level has the person in the resume reached in their most recent roles?', SENIORITY_OPTIONS);

// ---------------------------------------------------------------------------
// Job side (state = job text). Cached per job text + model.
// ---------------------------------------------------------------------------

export const IMPORTANCE_LEVELS = [
  'Not asked for: the posting does not mention it or any work that requires it',
  'Nice to have: listed as a bonus or preferred, or mentioned only in passing',
  'Important: an expected part of the work in this role',
  'Core requirement: explicitly required, and the role depends on it',
] as const;

export const IMPORTANCE_SHORT = ['Not asked for', 'Nice to have', 'Important', 'Core requirement'] as const;

export const skillImportance = (name: string, category: SkillCategory) =>
  score(
    {
      skill: name,
      skill_kind: CATEGORY_LABEL[category],
      question: 'How important is `skill`, a `skill_kind`, for the job described in the state?',
    },
    IMPORTANCE_LEVELS,
  );

export const jobSeniority = () =>
  choice('What seniority level is the job in the state hiring for?', SENIORITY_OPTIONS);

/** Speculative guard, asked alongside the importance questions at no extra latency. */
export const isJobPosting = () =>
  noul('Is the state a job posting or job description that describes a role someone can apply for?', {
    true: 'It describes a specific job: its work, requirements, or qualifications.',
    false: 'It is some other kind of page, such as a list of many jobs, an article, a profile, or a login page.',
  });

// ---------------------------------------------------------------------------
// Holistic (state = { job, resume }). Cached per job + resume + model.
// ---------------------------------------------------------------------------

export const WORK_LEVELS = [
  'None of it: the work is unrelated to anything in the resume',
  'A little: some overlap, but most of the work would be new to this person',
  'About half of the described work has been done before',
  'Most of the described work has been done before',
  'Nearly all of it: the resume shows this same kind of work done repeatedly',
] as const;

export const workOverlap = () =>
  score(
    'How much of the day-to-day work described in `job` has the person in `resume` already done in past roles or projects?',
    WORK_LEVELS,
  );

export const DOMAIN_LEVELS = [
  'Unrelated industry or problem domain',
  'Loosely related domain',
  'Closely related domain',
  'The same domain',
] as const;

export const domainOverlap = () =>
  score('How closely does the industry or problem domain in `resume` match the domain of `job`?', DOMAIN_LEVELS);

export const dealbreaker = () =>
  noul(
    'Does `job` state a hard requirement, such as a required degree, license, security clearance, spoken language, work authorization, or on-site location, that `resume` clearly does not meet?',
    {
      true: '`job` names a must-have requirement and `resume` clearly lacks it.',
      false: 'No such requirement, or `resume` meets it, or the resume simply does not say.',
    },
  );

// ---------------------------------------------------------------------------
// Composition helpers (pure numbers, no model involved)
// ---------------------------------------------------------------------------

export const SENIORITY_RANK: Record<Exclude<Seniority, 'unclear'>, number> = {
  entry: 0,
  mid: 1,
  senior: 2,
  lead: 3,
};

/**
 * Seniority fit from the level gap (resume minus job). Being one level above is
 * nearly fine; being below the bar drops quickly.
 */
export const SENIORITY_FIT_BY_GAP: Record<number, number> = {
  [-3]: 0,
  [-2]: 0.2,
  [-1]: 0.55,
  0: 1,
  1: 0.85,
  2: 0.7,
  3: 0.6,
};

/** Depth a skill needs, as a function of how important it is (both 0..1). */
export const targetDepth = (importance: number) => 0.25 + 0.5 * importance;

export const VERDICTS = [
  { min: 8.5, label: 'Made for you' },
  { min: 7, label: 'Strong fit' },
  { min: 5, label: 'Decent fit' },
  { min: 3, label: 'A stretch' },
  { min: 0, label: 'Poor fit' },
] as const;

export const verdictFor = (overall: number) =>
  (VERDICTS.find((v) => overall >= v.min) ?? VERDICTS[VERDICTS.length - 1]!).label;
