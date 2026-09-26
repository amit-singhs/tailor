import { ArrowLeft, ClipboardPaste, FileUp, Plus } from 'lucide-react';
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { THRESHOLDS } from '@/lib/jev/questions';
import { send } from '@/lib/messaging';
import { ACCEPT, parseResumeFile } from '@/lib/resume/parse';
import { findResumeCandidates, resolveSkillName } from '@/lib/skills/find';
import { normalizeText, sha256Hex, uid } from '@/lib/text';
import { AppError, type Resume, type ResumeSkill, type SkillCandidate } from '@/lib/types';
import { Steps } from './KeyViews';
import { SkillAdder } from './SkillEditor';
import { useApp } from './state';
import { Button, Field, IconButton, Notice, Spinner } from './ui';

type Phase =
  | { name: 'source' }
  | { name: 'checking'; text: string; fileName?: string; count: number }
  | { name: 'review'; text: string; fileName?: string; candidates: SkillCandidate[]; presence: Record<string, number> };

function labelFromFile(name: string) {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40) || 'My resume';
}

export function ResumeImport({ onboarding = false }: { onboarding?: boolean }) {
  const { resumes, saveResume, selectResume, go } = useApp();
  const [phase, setPhase] = useState<Phase>({ name: 'source' });
  const [label, setLabel] = useState(resumes.length ? `Resume ${resumes.length + 1}` : 'My resume');
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function analyze(text: string, fileName?: string) {
    setError(null);
    const candidates = findResumeCandidates(text);
    setPhase({ name: 'checking', text, fileName, count: candidates.length });
    try {
      const presence = await send('skills/verify', { text, candidates });
      setPhase({ name: 'review', text, fileName, candidates, presence });
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Couldn’t check the skills.');
      setPhase({ name: 'source' });
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const text = await parseResumeFile(file);
      if (label.startsWith('Resume ') || label === 'My resume') setLabel(labelFromFile(file.name));
      await analyze(text, file.name);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Couldn’t read that file.');
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    void onFile(e.dataTransfer.files[0]);
  }

  if (phase.name === 'review') {
    return (
      <ReviewSkills
        onboarding={onboarding}
        label={label}
        setLabel={setLabel}
        candidates={phase.candidates}
        presence={phase.presence}
        onBack={() => setPhase({ name: 'source' })}
        onSave={async (skills) => {
          const now = Date.now();
          const resume: Resume = {
            id: uid(),
            label: label.trim() || 'My resume',
            fileName: phase.fileName,
            text: phase.text,
            textHash: (await sha256Hex(phase.text)).slice(0, 32),
            skills,
            createdAt: now,
            updatedAt: now,
          };
          await saveResume(resume);
          await selectResume(resume.id);
          go({ name: 'measure' });
        }}
      />
    );
  }

  return (
    <div className="px-5 pb-8 pt-5">
      {onboarding ? (
        <Steps current={2} />
      ) : (
        <div className="-ml-2 flex items-center gap-1">
          <IconButton label="Back to resumes" onClick={() => go({ name: 'resumes' })}>
            <ArrowLeft className="size-4" />
          </IconButton>
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em]">Add a resume</h2>
        </div>
      )}
      {onboarding && <h2 className="mt-5 font-display text-[22px] font-semibold tracking-[-0.015em]">Add your resume</h2>}
      <p className="mt-1.5 text-[13.5px] text-muted">Add one per profile you apply with, like “Backend Python” and “Full-stack JS”.</p>

      <Field className="mt-5" label="Name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />

      {phase.name === 'checking' ? (
        <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
          <Spinner label={`Jev is checking ${phase.count} possible skills`} />
          <p className="mt-2 text-[12.5px] text-muted">It confirms each one against your resume, so “Go” the word doesn’t count as Go the language.</p>
        </div>
      ) : pasting ? (
        <div className="mt-5">
          <label htmlFor="paste" className="mb-1.5 block text-[13px] font-medium">
            Resume text
          </label>
          <textarea
            id="paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={12}
            placeholder="Paste the full text of your resume"
            className="w-full resize-y rounded-[10px] border border-line bg-surface p-3 text-[13px] leading-relaxed text-ink placeholder:text-muted focus:border-focus focus:outline-none"
          />
          <div className="mt-3 flex gap-2">
            <Button
              disabled={normalizeText(pasted).length < 200}
              onClick={() => void analyze(normalizeText(pasted))}
            >
              Find my skills
            </Button>
            <Button variant="ghost" onClick={() => setPasting(false)}>
              Upload a file instead
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`mt-5 flex flex-col items-center rounded-2xl border-2 border-dashed px-5 py-8 text-center transition-colors ${
              dragging ? 'border-tape-edge bg-partial-bg' : 'border-line bg-surface'
            }`}
          >
            <FileUp className="size-6 text-ink-soft" aria-hidden />
            <p className="mt-3 text-[14px] font-medium">Drop your resume here</p>
            <p className="mt-1 text-[12.5px] text-muted">PDF, DOCX, TXT, or Markdown. Read on your computer.</p>
            <Button className="mt-4" variant="secondary" onClick={() => fileRef.current?.click()}>
              Choose file
            </Button>
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
          <Button variant="ghost" className="mt-2 w-full" icon={<ClipboardPaste className="size-4" aria-hidden />} onClick={() => setPasting(true)}>
            Paste text instead
          </Button>
        </>
      )}

      {error && (
        <div className="mt-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
    </div>
  );
}

function ReviewSkills({
  onboarding,
  label,
  setLabel,
  candidates,
  presence,
  onBack,
  onSave,
}: {
  onboarding: boolean;
  label: string;
  setLabel(v: string): void;
  candidates: SkillCandidate[];
  presence: Record<string, number>;
  onBack(): void;
  onSave(skills: ResumeSkill[]): Promise<void>;
}) {
  const sorted = useMemo(() => [...candidates].sort((a, b) => (presence[b.id] ?? 0) - (presence[a.id] ?? 0)), [candidates, presence]);
  const [checked, setChecked] = useState<Set<string>>(() => new Set(candidates.filter((c) => (presence[c.id] ?? 0) >= THRESHOLDS.skillPresent).map((c) => c.id)));
  const [added, setAdded] = useState<ResumeSkill[]>([]);
  const [saving, setSaving] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  const kept = sorted.filter((c) => (presence[c.id] ?? 0) >= THRESHOLDS.skillPresent);
  const rejected = sorted.filter((c) => (presence[c.id] ?? 0) < THRESHOLDS.skillPresent);
  const total = checked.size + added.length;

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const row = (c: SkillCandidate) => {
    const p = presence[c.id] ?? 0;
    return (
      <li key={c.id}>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken">
          <input type="checkbox" className="mt-1 size-4 accent-[var(--ink)]" checked={checked.has(c.id)} onChange={() => toggle(c.id)} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="font-medium">{c.name}</span>
              <span className="shrink-0 text-[12px] text-muted tabular" title="Jev’s confidence that your resume refers to this skill">
                {Math.round(p * 100)}%
              </span>
            </span>
            {c.snippet && <span className="mt-0.5 line-clamp-1 block text-[12px] text-muted">“{c.snippet}”</span>}
          </span>
        </label>
      </li>
    );
  };

  return (
    <div className="px-5 pb-28 pt-5">
      {onboarding ? <Steps current={3} /> : (
        <div className="-ml-2 flex items-center gap-1">
          <IconButton label="Back" onClick={onBack}>
            <ArrowLeft className="size-4" />
          </IconButton>
          <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em]">Check skills</h2>
        </div>
      )}
      {onboarding && <h2 className="mt-5 font-display text-[22px] font-semibold tracking-[-0.015em]">Check your skills</h2>}
      <p className="mt-1.5 text-[13.5px] text-muted">
        Jev confirmed these against your resume. Untick anything wrong and add what’s missing. Per-skill scores are only as good as this list.
      </p>

      <Field className="mt-4" label="Resume name" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} />

      {kept.length === 0 && added.length === 0 && (
        <div className="mt-4">
          <Notice tone="warn">No skills confirmed. Add a few below, or check that the resume text came through.</Notice>
        </div>
      )}

      <ul className="-mx-3 mt-4 space-y-0.5">{kept.map(row)}</ul>

      {added.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {added.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-sunken py-1 pl-3 pr-1 text-[13px]">
              {s.name}
              <button type="button" aria-label={`Remove ${s.name}`} className="rounded-full px-1.5 text-muted hover:text-gap" onClick={() => setAdded(added.filter((x) => x.id !== s.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4">
        <SkillAdder
          exclude={new Set([...checked, ...added.map((a) => a.id)])}
          onAdd={(name) => {
            const r = resolveSkillName(name);
            const existing = candidates.find((c) => c.id === r.id);
            if (existing) {
              setChecked((prev) => new Set(prev).add(r.id));
              return;
            }
            setAdded((prev) => [...prev, { ...r, source: 'user', presence: null }]);
          }}
        />
      </div>

      {rejected.length > 0 && (
        <div className="mt-6">
          <button type="button" className="text-[13px] font-medium text-ink-soft underline decoration-line underline-offset-2 hover:text-ink" onClick={() => setShowRejected(!showRejected)}>
            {showRejected ? 'Hide' : 'Show'} {rejected.length} that Jev ruled out
          </button>
          {showRejected && <ul className="-mx-3 mt-2 space-y-0.5">{rejected.map(row)}</ul>}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 px-5 py-3 backdrop-blur">
        <Button
          size="lg"
          className="w-full"
          busy={saving}
          disabled={total === 0}
          icon={<Plus className="size-4" aria-hidden />}
          onClick={async () => {
            setSaving(true);
            const chosen: ResumeSkill[] = candidates
              .filter((c) => checked.has(c.id))
              .map((c) => ({ id: c.id, name: c.name, category: c.category, source: c.source, presence: presence[c.id] ?? null }));
            await onSave([...chosen, ...added]);
          }}
        >
          Save resume with {total} skill{total === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  );
}
