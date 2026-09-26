import { ArrowLeft, ChevronRight, FileText, Plus, Trash2 } from 'lucide-react';
import { useId, useMemo, useState, type FormEvent } from 'react';
import { resolveSkillName, taxonomyNames } from '@/lib/skills/find';
import type { Resume } from '@/lib/types';
import { useApp } from './state';
import { Button, Card, Field, IconButton, Notice } from './ui';

export function SkillAdder({ onAdd, exclude }: { onAdd(name: string): void; exclude: Set<string> }) {
  const listId = useId();
  const [value, setValue] = useState('');
  const names = useMemo(taxonomyNames, []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (!v) return;
    if (!exclude.has(resolveSkillName(v).id)) onAdd(v);
    setValue('');
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2">
      <div className="flex-1">
        <label htmlFor={`${listId}-in`} className="mb-1.5 block text-[13px] font-medium">
          Add a skill
        </label>
        <input
          id={`${listId}-in`}
          list={listId}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. Kubernetes"
          maxLength={40}
          className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm placeholder:text-muted focus:border-focus focus:outline-none"
        />
        <datalist id={listId}>
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <Button type="submit" variant="secondary" disabled={!value.trim()} icon={<Plus className="size-4" aria-hidden />}>
        Add
      </Button>
    </form>
  );
}

export function ResumesView() {
  const { resumes, activeResume, go } = useApp();
  return (
    <div className="px-5 pb-8 pt-5">
      <div className="-ml-2 flex items-center gap-1">
        <IconButton label="Back to measuring" onClick={() => go({ name: 'measure' })}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em]">Resumes</h2>
      </div>
      <ul className="mt-4 space-y-2">
        {resumes.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => go({ name: 'resume', id: r.id })}
              className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3.5 text-left transition-colors hover:border-ink-soft"
            >
              <FileText className="size-4 shrink-0 text-muted" aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.label}</span>
                <span className="block text-[12.5px] text-muted">
                  {r.skills.length} skills{r.id === activeResume?.id ? ', in use' : ''}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <Button className="mt-4 w-full" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => go({ name: 'import' })}>
        Add a resume
      </Button>
    </div>
  );
}

export function ResumeDetail({ id }: { id: string }) {
  const { resumes, saveResume, removeResume, go } = useApp();
  const resume = resumes.find((r) => r.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showText, setShowText] = useState(false);

  if (!resume) {
    return (
      <div className="p-5">
        <Notice tone="warn" action={<Button size="sm" onClick={() => go({ name: 'resumes' })}>Back to resumes</Button>}>
          That resume was removed.
        </Notice>
      </div>
    );
  }

  const update = (patch: Partial<Resume>) => void saveResume({ ...resume, ...patch, updatedAt: Date.now() });

  return (
    <div className="px-5 pb-10 pt-5">
      <div className="-ml-2 flex items-center gap-1">
        <IconButton label="Back to resumes" onClick={() => go({ name: 'resumes' })}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <h2 className="truncate font-display text-[20px] font-semibold tracking-[-0.01em]">{resume.label}</h2>
      </div>

      <Field
        className="mt-4"
        label="Name"
        defaultValue={resume.label}
        maxLength={40}
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== resume.label) update({ label: v });
        }}
      />

      <h3 className="mt-6 text-[13px] font-semibold">Skills ({resume.skills.length})</h3>
      <p className="mt-0.5 text-[12.5px] text-muted">Each gets its own score on every job. Jev judges how deep your experience is from the resume text.</p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {resume.skills.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-1 rounded-full bg-surface py-1 pl-3 pr-1 text-[13px] ring-1 ring-line">
            {s.name}
            <button
              type="button"
              aria-label={`Remove ${s.name}`}
              className="rounded-full px-1.5 text-muted hover:text-gap"
              onClick={() => update({ skills: resume.skills.filter((x) => x.id !== s.id) })}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-4">
        <SkillAdder
          exclude={new Set(resume.skills.map((s) => s.id))}
          onAdd={(name) => {
            const r = resolveSkillName(name);
            update({ skills: [...resume.skills, { ...r, source: 'user', presence: null }] });
          }}
        />
      </div>

      <Card className="mt-6 p-4">
        <button type="button" className="text-[13px] font-medium underline decoration-line underline-offset-2" onClick={() => setShowText(!showText)}>
          {showText ? 'Hide' : 'Show'} resume text
        </button>
        {resume.fileName && <p className="mt-1 text-[12px] text-muted">From {resume.fileName}</p>}
        {showText && <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed text-ink-soft">{resume.text}</pre>}
      </Card>

      <div className="mt-8">
        {confirmDelete ? (
          <Notice
            tone="warn"
            title={`Delete “${resume.label}”?`}
            action={
              <>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={async () => {
                    await removeResume(resume.id);
                    go({ name: 'resumes' });
                  }}
                >
                  Delete resume
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Button>
              </>
            }
          >
            It’s removed from this browser. This can’t be undone.
          </Notice>
        ) : (
          <Button variant="danger" size="sm" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setConfirmDelete(true)}>
            Delete resume
          </Button>
        )}
      </div>
    </div>
  );
}
