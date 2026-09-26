import { ChevronDown, Layers, RefreshCw, Ruler, ShieldAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { THRESHOLDS, WEIGHTS, verdictFor } from '@/lib/jev/questions';
import { readJobFromActiveTab, requestAllSitesPermission } from '@/lib/job/read';
import { send, type CompareRow } from '@/lib/messaging';
import { AppError, type FitResult, type JobPosting, type SkillFit, type SkillTier } from '@/lib/types';
import { MiniTape, TapeMeasure } from './TapeMeasure';
import { useApp } from './state';
import { Button, Card, Notice, Spinner } from './ui';

type Phase = 'idle' | 'reading' | 'scoring' | 'done' | 'error';

const SOURCE_LABEL = (s: JobPosting['source']) =>
  s === 'selection' ? 'From your selected text' : s === 'json-ld' ? 'From the page’s job data' : s === 'heuristic' ? 'Read from the page' : `Read from ${s.slice(8).replace(/^\w/, (c) => c.toUpperCase())}`;

export function MeasureView() {
  const { activeResume, resumes, selectResume, setVault, go } = useApp();
  const [phase, setPhase] = useState<Phase>('idle');
  const [job, setJob] = useState<JobPosting | null>(null);
  const [result, setResult] = useState<FitResult | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [stale, setStale] = useState(false);
  const [compare, setCompare] = useState<CompareRow[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const lastResumeId = useRef(activeResume?.id);

  const score = useCallback(
    async (j: JobPosting, force = false) => {
      if (!activeResume) return;
      setPhase('scoring');
      setError(null);
      try {
        const r = await send('fit/score', { job: j, resumeId: activeResume.id, force });
        setResult(r);
        setPhase('done');
      } catch (err) {
        const e = err instanceof AppError ? err : new AppError('UNKNOWN', String(err));
        if (e.code === 'LOCKED' || e.code === 'NO_VAULT') setVault(await send('vault/status'));
        setError(e);
        setPhase('error');
      }
    },
    [activeResume, setVault],
  );

  const measure = useCallback(
    async (force = false) => {
      setPhase('reading');
      setError(null);
      setStale(false);
      setCompare(null);
      try {
        const j = await readJobFromActiveTab();
        setJob(j);
        await score(j, force);
      } catch (err) {
        setError(err instanceof AppError ? err : new AppError('UNKNOWN', String(err)));
        setPhase('error');
      }
    },
    [score],
  );

  // Switching resume re-scores the same job.
  useEffect(() => {
    if (activeResume?.id !== lastResumeId.current) {
      lastResumeId.current = activeResume?.id;
      if (job && (phase === 'done' || phase === 'error')) void score(job);
    }
  }, [activeResume?.id, job, phase, score]);

  // Mark the result stale when the page changes.
  useEffect(() => {
    const onActivated = () => setStale(true);
    const onUpdated = (_id: number, info: { status?: string }, tab: { active?: boolean }) => {
      if (tab.active && info.status === 'complete') setStale(true);
    };
    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  const busy = phase === 'reading' || phase === 'scoring';

  return (
    <div className="px-5 pb-10 pt-4">
      {stale && result && !busy && (
        <div className="mb-3">
          <Notice tone="info" action={<Button size="sm" onClick={() => void measure()}>Measure this page</Button>}>
            You’ve moved to another page since this score.
          </Notice>
        </div>
      )}

      {phase === 'idle' && !result && <IdleHero onMeasure={() => void measure()} resumeLabel={activeResume?.label} />}

      {busy && (
        <Card className="p-5">
          <Spinner label={phase === 'reading' ? 'Reading the job description' : 'Jev is measuring the fit'} />
          {phase === 'scoring' && job && <p className="mt-2 line-clamp-2 text-[13px] text-muted">{job.title}</p>}
        </Card>
      )}

      {phase === 'error' && error && <ErrorPanel error={error} onRetry={() => void measure()} onSettings={() => go({ name: 'settings' })} />}

      {result && job && !busy && (
        <Result
          result={result}
          job={job}
          onRemeasure={() => void measure(true)}
          canCompare={resumes.length > 1}
          comparing={comparing}
          compare={compare}
          onCompare={async () => {
            setComparing(true);
            try {
              setCompare(await send('fit/compare', { job }));
            } catch (err) {
              setError(err instanceof AppError ? err : new AppError('UNKNOWN', String(err)));
            } finally {
              setComparing(false);
            }
          }}
          onPick={(id) => void selectResume(id)}
        />
      )}
    </div>
  );
}

function IdleHero({ onMeasure, resumeLabel }: { onMeasure(): void; resumeLabel?: string }) {
  return (
    <div className="pt-6">
      <h1 className="font-display text-[26px] font-semibold leading-[1.1] tracking-[-0.02em]">How well does this job fit?</h1>
      <p className="mt-2 max-w-[36ch] text-[14px] leading-relaxed text-ink-soft">
        Open a job posting on any site, then measure it against {resumeLabel ? `“${resumeLabel}”` : 'your resume'}.
      </p>
      <div className="mt-6" aria-hidden>
        <TapeMeasure value={0} />
      </div>
      <Button size="lg" className="mt-5 w-full" onClick={onMeasure} icon={<Ruler className="size-4" aria-hidden />}>
        Measure this job
      </Button>
      <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
        If Tailor reads the wrong part of the page, select the job description text first.
      </p>
    </div>
  );
}

function ErrorPanel({ error, onRetry, onSettings }: { error: AppError; onRetry(): void; onSettings(): void }) {
  const [granting, setGranting] = useState(false);
  if (error.code === 'PERMISSION_NEEDED') {
    return (
      <Notice
        tone="warn"
        title="Tailor needs permission to read this page"
        action={
          <>
            <Button
              size="sm"
              busy={granting}
              onClick={async () => {
                setGranting(true);
                const ok = await requestAllSitesPermission().catch(() => false);
                setGranting(false);
                if (ok) onRetry();
              }}
            >
              Allow on job sites
            </Button>
            <Button size="sm" variant="ghost" onClick={onRetry}>
              Try again
            </Button>
          </>
        }
      >
        Click the Tailor icon in the toolbar while you’re on the job page, or allow Tailor to read pages. It only reads a page when you click Measure.
      </Notice>
    );
  }
  const title: Partial<Record<AppError['code'], string>> = {
    NO_JOB_FOUND: 'No job description found',
    NOT_A_JOB: 'This doesn’t look like a job posting',
    PAGE_BLOCKED: 'This page can’t be read',
    AUTH: 'The API key was rejected',
    UNKNOWN_MODEL: 'Unknown Jev model',
    RATE_LIMIT: 'Slow down a little',
    OVERLOADED: 'TypeSafe is busy',
    NETWORK: 'You seem to be offline',
    TIMEOUT: 'That took too long',
  };
  return (
    <Notice
      tone="error"
      title={title[error.code] ?? 'Couldn’t measure this job'}
      action={
        error.code === 'AUTH' || error.code === 'UNKNOWN_MODEL' ? (
          <Button size="sm" onClick={onSettings}>
            Open settings
          </Button>
        ) : error.code === 'PAGE_BLOCKED' ? null : (
          <Button size="sm" variant="secondary" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={onRetry}>
            Try again
          </Button>
        )
      }
    >
      {error.message}
    </Notice>
  );
}

const TIER_META: Record<SkillTier, { title: string; tone: 'fit' | 'partial' | 'gap' | 'muted'; dot: string }> = {
  strong: { title: 'Strong matches', tone: 'fit', dot: 'bg-fit' },
  partial: { title: 'Partial matches', tone: 'partial', dot: 'bg-partial' },
  missing: { title: 'Gaps for this job', tone: 'gap', dot: 'bg-gap' },
  'not-needed': { title: 'On your resume, not needed here', tone: 'muted', dot: 'bg-line' },
};

function Result({
  result,
  job,
  onRemeasure,
  canCompare,
  comparing,
  compare,
  onCompare,
  onPick,
}: {
  result: FitResult;
  job: JobPosting;
  onRemeasure(): void;
  canCompare: boolean;
  comparing: boolean;
  compare: CompareRow[] | null;
  onCompare(): void;
  onPick(id: string): void;
}) {
  const [showNotNeeded, setShowNotNeeded] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const byTier = (t: SkillTier) => result.skills.filter((s) => s.tier === t);
  const verdict = verdictFor(result.overall);

  return (
    <div>
      <header>
        <p className="text-[12px] text-muted">{SOURCE_LABEL(job.source)}</p>
        <h1 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">{job.title}</h1>
        {job.company && <p className="text-[13px] text-muted">{job.company}</p>}
      </header>

      <Card className="mt-4 px-4 pb-3 pt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-[56px] font-semibold leading-[0.9] tracking-[-0.035em] tabular">{result.overall.toFixed(1)}</span>
            <span className="text-[15px] text-muted tabular">/10</span>
          </div>
          <div className="pb-1 text-right">
            <p className="font-display text-[18px] font-semibold tracking-[-0.01em]">{verdict}</p>
            <p className="text-[12px] text-muted">with {result.resumeLabel}</p>
          </div>
        </div>
        <div className="mt-3">
          <TapeMeasure value={result.overall} animateKey={`${result.jobHash}-${result.resumeId}-${result.computedAt}`} />
        </div>
        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2.5 border-t border-line pt-3">
          {result.components.map((c) => (
            <div key={c.key}>
              <dt className="flex items-baseline justify-between text-[12px] text-muted">
                {c.label}
                <span className="font-medium text-ink tabular">{c.value === null ? 'n/a' : (c.value * 10).toFixed(1)}</span>
              </dt>
              <dd className="mt-1">
                <MiniTape value={c.value === null ? 0 : c.value * 10} tone={c.value === null ? 'muted' : 'fit'} />
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {result.dealbreaker.probability >= THRESHOLDS.dealbreaker && (
        <div className="mt-3">
          <Notice tone="warn" title="Possible hard requirement you don’t meet">
            The posting seems to require something your resume doesn’t show, like a degree, clearance, language, or location.
            {result.dealbreaker.capped && ` The score is capped at ${THRESHOLDS.dealbreakerCap} until you check it.`}
          </Notice>
        </div>
      )}
      {result.lowConfidence && (
        <div className="mt-3">
          <Notice tone="info">Jev was unsure about several skills here, often because the posting is short or vague. Treat this score as rough.</Notice>
        </div>
      )}

      {(['strong', 'partial', 'missing'] as const).map((tier) => {
        const list = byTier(tier);
        if (!list.length) return null;
        return <SkillGroup key={tier} tier={tier} skills={list} />;
      })}

      {byTier('not-needed').length > 0 && (
        <section className="mt-6">
          <button
            type="button"
            aria-expanded={showNotNeeded}
            onClick={() => setShowNotNeeded(!showNotNeeded)}
            className="flex w-full items-center justify-between text-left text-[13px] font-semibold text-ink-soft"
          >
            {TIER_META['not-needed'].title} ({byTier('not-needed').length})
            <ChevronDown className={`size-4 transition-transform ${showNotNeeded ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showNotNeeded && (
            <p className="mt-2 text-[13px] leading-relaxed text-muted">{byTier('not-needed').map((s) => s.name).join(', ')}</p>
          )}
        </section>
      )}

      <div className="mt-7 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<RefreshCw className="size-3.5" aria-hidden />} onClick={onRemeasure}>
          Measure again
        </Button>
        {canCompare && (
          <Button variant="secondary" size="sm" busy={comparing} icon={<Layers className="size-3.5" aria-hidden />} onClick={onCompare}>
            Compare my resumes
          </Button>
        )}
      </div>

      {compare && (
        <Card className="mt-3 p-3">
          <h2 className="px-1 text-[13px] font-semibold">Best resume for this job</h2>
          <ul className="mt-2 space-y-1">
            {compare.map((row, i) => (
              <li key={row.resumeId}>
                <button
                  type="button"
                  onClick={() => onPick(row.resumeId)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sunken ${row.resumeId === result.resumeId ? 'bg-sunken' : ''}`}
                >
                  <span className="w-28 shrink-0 truncate text-[13px] font-medium">{row.label}</span>
                  <span className="flex-1">
                    <MiniTape value={row.overall ?? 0} tone={row.overall === null ? 'muted' : 'fit'} />
                  </span>
                  <span className="w-9 text-right text-[13px] font-semibold tabular">{row.overall === null ? 'n/a' : row.overall.toFixed(1)}</span>
                  {i === 0 && row.overall !== null && <span className="rounded-full bg-tape px-2 py-0.5 text-[11px] font-semibold text-tape-ink">Best</span>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section className="mt-6 rounded-2xl bg-sunken p-4">
        <button type="button" aria-expanded={showHow} onClick={() => setShowHow(!showHow)} className="flex w-full items-center justify-between text-left text-[13px] font-semibold">
          How this score works
          <ChevronDown className={`size-4 transition-transform ${showHow ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        {showHow && (
          <div className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-ink-soft">
            <p>
              Jev answers narrow questions: how important each skill is to the job, how deep your resume shows it, how much of the day-to-day work you’ve done, and whether the domain matches.
              Tailor combines those answers with fixed weights, in code:
            </p>
            <ul className="space-y-1">
              {result.components.map((c) => (
                <li key={c.key} className="flex justify-between gap-3">
                  <span>
                    {c.label}
                    {c.detail ? <span className="text-muted">. {c.detail}</span> : null}
                  </span>
                  <span className="shrink-0 tabular">{Math.round((WEIGHTS[c.key] ?? 0) * 100)}%</span>
                </li>
              ))}
            </ul>
            <p>A skill scores 10 when your depth meets what its importance calls for. Parts Jev couldn’t judge are left out and the rest re-weighted.</p>
            <p className="text-muted">Model: {result.model}</p>
          </div>
        )}
      </section>
    </div>
  );
}

function SkillGroup({ tier, skills }: { tier: SkillTier; skills: SkillFit[] }) {
  const meta = TIER_META[tier];
  return (
    <section className="mt-6">
      <h2 className="flex items-center gap-2 text-[13px] font-semibold">
        <span className={`size-2 rounded-full ${meta.dot}`} aria-hidden />
        {meta.title}
        <span className="font-normal text-muted tabular">{skills.length}</span>
      </h2>
      <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
        {skills.map((s) => (
          <li key={s.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 truncate text-[14px] font-medium">
                {s.name}
                {!s.inResume && (
                  <span className="ml-2 align-middle text-[11px] font-normal text-muted">{s.depth >= 0.25 ? 'not in your skill list' : 'not on resume'}</span>
                )}
              </span>
              <span className="shrink-0 text-[14px] font-semibold tabular">{s.score.toFixed(1)}</span>
            </div>
            <div className="mt-1.5">
              <MiniTape value={s.score} tone={meta.tone} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted">
              Job: {s.importanceLabel.toLowerCase()}. You: {s.depthLabel.toLowerCase()}.
              {s.uncertain && (
                <span className="inline-flex items-center gap-0.5 text-partial" title="Jev’s confidence was low on this one">
                  <ShieldAlert className="size-3" aria-hidden /> unsure
                </span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
