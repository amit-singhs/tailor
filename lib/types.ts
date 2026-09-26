export type SkillCategory =
  | 'language'
  | 'frontend'
  | 'backend'
  | 'data'
  | 'ml'
  | 'cloud'
  | 'devops'
  | 'database'
  | 'mobile'
  | 'testing'
  | 'security'
  | 'design'
  | 'product'
  | 'business'
  | 'practice'
  | 'soft'
  | 'other';

/** One entry in the bundled skill taxonomy (lib/skills/taxonomy.ts). */
export interface TaxonomySkill {
  id: string;
  name: string;
  category: SkillCategory;
  aliases?: string[];
  /**
   * Match only with the exact casing given (e.g. "Go", "R", "C").
   * Use for names that are also ordinary words or single letters.
   */
  caseSensitive?: boolean;
}

export type SkillSource = 'taxonomy' | 'skills-section' | 'user';

/** A possible skill found in text by code, before Jev verifies it. */
export interface SkillCandidate {
  id: string;
  name: string;
  category: SkillCategory;
  source: SkillSource;
  /** A short excerpt around the first match, for the review screen. */
  snippet?: string;
}

export interface ResumeSkill {
  id: string;
  name: string;
  category: SkillCategory;
  source: SkillSource;
  /** Jev's probability that the resume really refers to this skill; null when added by hand. */
  presence: number | null;
}

export interface Resume {
  id: string;
  label: string;
  fileName?: string;
  text: string;
  /** SHA-256 of the normalized text. Keys the per-resume Jev cache. */
  textHash: string;
  skills: ResumeSkill[];
  createdAt: number;
  updatedAt: number;
}

/** A Score answer, normalized so code can combine it. */
export interface JudgedScore {
  /** Raw expected level from Jev, 0..max. */
  score: number;
  /** Highest level index (levels - 1). */
  max: number;
  confidence: number;
}

export interface JudgedChoice<T extends string = string> {
  choice: T;
  confidence: number;
  probabilities: Record<string, number>;
}

export type JobSource =
  | 'selection'
  | 'json-ld'
  | 'heuristic'
  | `adapter:${string}`;

export interface JobPosting {
  url: string;
  title: string;
  company?: string;
  text: string;
  source: JobSource;
  hash: string;
}

export type Seniority = 'entry' | 'mid' | 'senior' | 'lead' | 'unclear';

export type SkillTier = 'strong' | 'partial' | 'missing' | 'not-needed';

export interface SkillFit {
  id: string;
  name: string;
  category: SkillCategory;
  inResume: boolean;
  /** 0..1, how much the job needs it. */
  importance: number;
  importanceLabel: string;
  /** 0..1, how much evidence the resume shows. */
  depth: number;
  depthLabel: string;
  /** 0..1, depth against what the job's importance calls for. */
  match: number;
  /** 0..10 display score. */
  score: number;
  tier: SkillTier;
  uncertain: boolean;
}

export type ComponentKey = 'skills' | 'work' | 'domain' | 'seniority';

export interface FitComponent {
  key: ComponentKey;
  label: string;
  /** 0..1, or null when Jev could not judge it and it was left out. */
  value: number | null;
  weight: number;
  detail?: string;
}

export interface FitResult {
  jobHash: string;
  resumeId: string;
  resumeLabel: string;
  jobTitle: string;
  /** 0..10, one decimal. */
  overall: number;
  components: FitComponent[];
  skills: SkillFit[];
  dealbreaker: { probability: number; capped: boolean };
  jobSeniority: Seniority;
  resumeSeniority: Seniority;
  lowConfidence: boolean;
  model: string;
  computedAt: number;
}

export interface Settings {
  model: string;
  /** 0 keeps the key unlocked until the browser closes. */
  autoLockMinutes: number;
}

export type ErrorCode =
  | 'NO_VAULT'
  | 'LOCKED'
  | 'BAD_PASSPHRASE'
  | 'TOO_MANY_ATTEMPTS'
  | 'AUTH'
  | 'RATE_LIMIT'
  | 'OVERLOADED'
  | 'BAD_REQUEST'
  | 'UNKNOWN_MODEL'
  | 'BAD_RESPONSE'
  | 'NETWORK'
  | 'TIMEOUT'
  | 'NOT_A_JOB'
  | 'NO_JOB_FOUND'
  | 'PAGE_BLOCKED'
  | 'PERMISSION_NEEDED'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'UNKNOWN';

export interface AppErrorShape {
  code: ErrorCode;
  message: string;
  retryAfterMs?: number;
}

export class AppError extends Error implements AppErrorShape {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON(): AppErrorShape {
    return { code: this.code, message: this.message, retryAfterMs: this.retryAfterMs };
  }
}
