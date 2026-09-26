import { ExternalLink, KeyRound, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { send } from '@/lib/messaging';
import { AppError } from '@/lib/types';
import { passphraseProblem } from '@/lib/vault/crypto';
import { useApp } from './state';
import { Button, Field, Notice, TapeGlyph } from './ui';

export function Steps({ current }: { current: 1 | 2 | 3 }) {
  const steps = ['Connect Jev', 'Add a resume', 'Check skills'];
  return (
    <ol className="flex items-center gap-2 text-[12px]" aria-label="Setup progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const state = n < current ? 'done' : n === current ? 'now' : 'next';
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === 'now' ? 'step' : undefined}>
            <span
              className={`inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular ${
                state === 'now' ? 'bg-tape text-tape-ink' : state === 'done' ? 'bg-ink text-surface' : 'bg-sunken text-muted'
              }`}
            >
              {n}
            </span>
            <span className={state === 'now' ? 'font-medium text-ink' : 'text-muted'}>{label}</span>
            {n < steps.length && <span className="h-px w-3 bg-line" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

export function ConnectView({ replacing = false, onDone }: { replacing?: boolean; onDone?: () => void }) {
  const { setVault } = useApp();
  const [apiKey, setApiKey] = useState('');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passErr = touched ? passphraseProblem(pass) : null;
  const matchErr = touched && pass2 && pass !== pass2 ? 'The two passphrases don’t match.' : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!apiKey.trim()) return setError('Paste your TypeSafe API key.');
    if (passphraseProblem(pass) || pass !== pass2) return;
    setBusy(true);
    setError(null);
    try {
      if (replacing) await send('vault/forget');
      setVault(await send('vault/setup', { apiKey, passphrase: pass }));
      setApiKey('');
      setPass('');
      setPass2('');
      onDone?.();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Couldn’t save the key.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-5 pb-8 pt-6">
      {!replacing && (
        <>
          <div className="flex items-center gap-2.5">
            <TapeGlyph className="size-8" />
            <h1 className="font-display text-[28px] font-semibold leading-none tracking-[-0.02em]">Tailor</h1>
          </div>
          <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-ink-soft">
            See how well your resume fits the job you’re looking at, skill by skill, from 0 to 10.
          </p>
          <div className="mt-6">
            <Steps current={1} />
          </div>
        </>
      )}

      <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
        <Field
          label="TypeSafe API key"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Paste your key"
          hint={
            <a className="inline-flex items-center gap-1 underline decoration-line underline-offset-2 hover:text-ink" href="https://console.typesafe.ai/keys" target="_blank" rel="noreferrer">
              Create a key in the TypeSafe console <ExternalLink className="size-3" aria-hidden />
            </a>
          }
        />
        <Field
          label="Passphrase to lock the key"
          type="password"
          autoComplete="new-password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          error={passErr}
          hint="The key is encrypted with this passphrase before it’s saved. Tailor can’t recover it if you forget."
        />
        <Field label="Repeat passphrase" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} error={matchErr} />

        {error && <Notice tone="error">{error}</Notice>}

        <Button type="submit" size="lg" className="w-full" busy={busy} icon={<KeyRound className="size-4" aria-hidden />}>
          {busy ? 'Checking the key' : replacing ? 'Replace key' : 'Connect'}
        </Button>
      </form>

      <div className="mt-6 space-y-2 text-[12.5px] leading-relaxed text-muted">
        <p>
          <span className="font-medium text-ink-soft">What stays on your computer:</span> your resumes, scores, and the encrypted key. Tailor has no server.
        </p>
        <p>
          <span className="font-medium text-ink-soft">What goes to TypeSafe:</span> resume and job text, only when you add a resume or measure a job, so Jev can judge them.
        </p>
      </div>
    </div>
  );
}

export function UnlockView() {
  const { vault, setVault } = useApp();
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgetting, setForgetting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pass) return;
    setBusy(true);
    setError(null);
    try {
      setVault(await send('vault/unlock', { passphrase: pass }));
      setPass('');
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Couldn’t unlock.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-[70vh] flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-[340px]">
        <div className="flex size-11 items-center justify-center rounded-xl bg-sunken">
          <Lock className="size-5 text-ink-soft" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-[24px] font-semibold tracking-[-0.015em]">Tailor is locked</h1>
        <p className="mt-1.5 text-[13.5px] text-muted">
          Enter your passphrase to use the saved key{vault?.hint ? ` ending in ${vault.hint}` : ''}.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-3">
          <Field label="Passphrase" type="password" autoFocus autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} />
          {error && <Notice tone="error">{error}</Notice>}
          <Button type="submit" className="w-full" size="lg" busy={busy} disabled={!pass}>
            Unlock
          </Button>
        </form>
        <div className="mt-6 text-[12.5px] text-muted">
          {forgetting ? (
            <Notice
              tone="warn"
              title="Forgot the passphrase?"
              action={
                <>
                  <Button size="sm" variant="danger" onClick={async () => setVault(await send('vault/forget'))}>
                    Remove saved key
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setForgetting(false)}>
                    Keep it
                  </Button>
                </>
              }
            >
              The key can’t be recovered without it. Remove the saved key and add it again; your resumes stay.
            </Notice>
          ) : (
            <button type="button" className="underline decoration-line underline-offset-2 hover:text-ink" onClick={() => setForgetting(true)}>
              Forgot your passphrase?
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
