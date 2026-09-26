/**
 * Pure composition: turns Jev's typed answers into Tailor's scores.
 * No I/O, no model calls: everything here is plain arithmetic in code, as
 * TypeSafe recommends (composite scoring pattern). Fully unit-tested.
 */
import {
  DEPTH_SHORT,
  IMPORTANCE_SHORT,
  SENIORITY_FIT_BY_GAP,
  SENIORITY_RANK,
  THRESHOLDS,
  WEIGHTS,
  targetDepth,
} from '../jev/questions';
import type {
  FitComponent,
  FitResult,
  JudgedChoice,
  JudgedScore,
  Seniority,
  SkillCategory,
  SkillFit,
  SkillTier,
} from '../types';

export const normalize = (s: JudgedScore): number => (s.max > 0 ? clamp01(s.score / s.max) : 0);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

function nearestLabel(s: JudgedScore, labels: readonly string[]): string {
  return labels[Math.min(labels.length - 1, Math.max(0, Math.round(s.score)))] ?? '';
}

export interface SkillInput {
  id: string;
  name: string;
  category: SkillCategory;
  inResume: boolean;
  importance: JudgedScore;
  depth: JudgedScore;
}

export function skillMatch(importance: number, depth: number): number {
  return clamp01(depth / targetDepth(importance));
}

export function tierFor(importance: number, match: number): SkillTier {
  if (importance < THRESHOLDS.relevantImportance) return 'not-needed';
  if (match >= THRESHOLDS.strongMatch) return 'strong';
  if (match >= THRESHOLDS.partialMatch) return 'partial';
  return 'missing';
}

export function fitSkill(input: SkillInput): SkillFit {
  const importance = normalize(input.importance);
  const depth = normalize(input.depth);
  const match = skillMatch(importance, depth);
  const tier = tierFor(importance, match);
  return {
    id: input.id,
    name: input.name,
    category: input.category,
    inResume: input.inResume,
    importance,
    importanceLabel: nearestLabel(input.importance, IMPORTANCE_SHORT),
    depth,
    depthLabel: nearestLabel(input.depth, DEPTH_SHORT),
    match,
    score: round1(10 * match),
    tier,
    uncertain:
      input.importance.confidence < THRESHOLDS.lowConfidence || input.depth.confidence < THRESHOLDS.lowConfidence,
  };
}

/** Importance-weighted coverage of the job's relevant skills, 0..1, or null if none are relevant. */
export function skillCoverage(skills: SkillFit[]): number | null {
  const relevant = skills.filter((s) => s.tier !== 'not-needed');
  const total = relevant.reduce((sum, s) => sum + s.importance, 0);
  if (total === 0) return null;
  return relevant.reduce((sum, s) => sum + s.importance * s.match, 0) / total;
}

export function seniorityFit(
  job: JudgedChoice<Seniority> | undefined,
  resume: JudgedChoice<Seniority> | undefined,
): number | null {
  if (!job || !resume) return null;
  if (job.choice === 'unclear' || resume.choice === 'unclear') return null;
  if (job.confidence < THRESHOLDS.lowConfidence || resume.confidence < THRESHOLDS.lowConfidence) return null;
  const gap = SENIORITY_RANK[resume.choice] - SENIORITY_RANK[job.choice];
  return SENIORITY_FIT_BY_GAP[gap] ?? (gap < 0 ? 0 : 0.6);
}

/** Weighted mean over the components that have a value; re-weights when some are missing. */
export function combine(components: FitComponent[]): number {
  const present = components.filter((c) => c.value !== null && c.weight > 0);
  const w = present.reduce((sum, c) => sum + c.weight, 0);
  if (w === 0) return 0;
  return present.reduce((sum, c) => sum + c.weight * (c.value as number), 0) / w;
}

const SENIORITY_LABEL: Record<Seniority, string> = {
  entry: 'entry level',
  mid: 'mid level',
  senior: 'senior',
  lead: 'lead or manager',
  unclear: 'unclear',
};

export interface ComposeInput {
  jobHash: string;
  jobTitle: string;
  resumeId: string;
  resumeLabel: string;
  model: string;
  skills: SkillInput[];
  work: JudgedScore;
  domain: JudgedScore;
  dealbreaker: number;
  jobSeniority?: JudgedChoice<Seniority>;
  resumeSeniority?: JudgedChoice<Seniority>;
}

const TIER_ORDER: Record<SkillTier, number> = { strong: 0, partial: 1, missing: 2, 'not-needed': 3 };

export function compose(input: ComposeInput): FitResult {
  const skills = input.skills
    .map(fitSkill)
    // Job-only skills matter only when the job actually asks for them.
    .filter((s) => s.inResume || s.tier !== 'not-needed')
    .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || b.importance - a.importance || b.score - a.score);

  const js = input.jobSeniority?.choice ?? 'unclear';
  const rs = input.resumeSeniority?.choice ?? 'unclear';
  const components: FitComponent[] = [
    { key: 'skills', label: 'Skills coverage', value: skillCoverage(skills), weight: WEIGHTS.skills },
    {
      key: 'work',
      label: 'Day-to-day work',
      value: normalize(input.work),
      weight: WEIGHTS.work,
      detail: input.work.confidence < THRESHOLDS.lowConfidence ? 'Jev was unsure about this one' : undefined,
    },
    { key: 'domain', label: 'Domain', value: normalize(input.domain), weight: WEIGHTS.domain },
    {
      key: 'seniority',
      label: 'Seniority',
      value: seniorityFit(input.jobSeniority, input.resumeSeniority),
      weight: WEIGHTS.seniority,
      detail: `Job: ${SENIORITY_LABEL[js]}. You: ${SENIORITY_LABEL[rs]}.`,
    },
  ];

  let overall = 10 * combine(components);
  const capped = input.dealbreaker >= THRESHOLDS.dealbreaker && overall > THRESHOLDS.dealbreakerCap;
  if (capped) overall = THRESHOLDS.dealbreakerCap;

  const relevant = skills.filter((s) => s.tier !== 'not-needed');
  const uncertainShare = relevant.length ? relevant.filter((s) => s.uncertain).length / relevant.length : 0;

  return {
    jobHash: input.jobHash,
    resumeId: input.resumeId,
    resumeLabel: input.resumeLabel,
    jobTitle: input.jobTitle,
    overall: round1(overall),
    components,
    skills,
    dealbreaker: { probability: input.dealbreaker, capped },
    jobSeniority: js,
    resumeSeniority: rs,
    lowConfidence: uncertainShare > 0.4,
    model: input.model,
    computedAt: Date.now(),
  };
}
