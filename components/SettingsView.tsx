import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { clearEverything } from '@/lib/db';
import { DEFAULT_MODEL } from '@/lib/jev/questions';
import { send } from '@/lib/messaging';
import { AppError, type Settings } from '@/lib/types';
import { ConnectView } from './KeyViews';
import { useApp } from './state';
import { Button, Card, Field, IconButton, Notice } from './ui';

const LOCK_OPTIONS = [
  { v: 5, label: '5 minutes' },
  { v: 15, label: '15 minutes' },
  { v: 30, label: '30 minutes' },
  { v: 60, label: '1 hour' },
  { v: 240, label: '4 hours' },
  { v: 0, label: 'When the browser closes' },
];

export function SettingsView() {
  const { settings, setSettings, vault, setVault, go, refresh } = useApp();
  const [model, setModel] = useState(settings?.model ?? DEFAULT_MODEL);
  const [msg, setMsg] = useState<{ tone: 'info' | 'error'; text: string } | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [wiping, setWiping] = useState(false);

  const save = async (patch: Partial<Settings>) => {
    try {
      setSettings(await send('settings/set', patch));
      setMsg({ tone: 'info', text: 'Saved.' });
    } catch (err) {
      setMsg({ tone: 'error', text: err instanceof AppError ? err.message : 'Couldn’t save.' });
    }
  };

  return (
    <div className="px-5 pb-10 pt-5">
      <div className="-ml-2 flex items-center gap-1">
        <IconButton label="Back to measuring" onClick={() => go({ name: 'measure' })}>
          <ArrowLeft className="size-4" />
        </IconButton>
        <h2 className="font-display text-[20px] font-semibold tracking-[-0.01em]">Settings</h2>
      </div>

      {msg && (
        <div className="mt-4">
          <Notice tone={msg.tone}>{msg.text}</Notice>
        </div>
      )}

      <Card className="mt-4 p-4">
        <h3 className="text-[14px] font-semibold">API key</h3>
        <p className="mt-1 text-[12.5px] text-muted">
          Saved encrypted{vault?.hint ? `, ending in ${vault.hint}` : ''}. Unlocked keys live in memory only.
        </p>
        <label htmlFor="autolock" className="mb-1.5 mt-4 block text-[13px] font-medium">
          Lock automatically after no use for
        </label>
        <select
          id="autolock"
          value={settings?.autoLockMinutes ?? 30}
          onChange={(e) => void save({ autoLockMinutes: Number(e.target.value) })}
          className="h-10 w-full rounded-[10px] border border-line bg-surface px-3 text-sm focus:border-focus focus:outline-none"
        >
          {LOCK_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={async () => setVault(await send('vault/lock'))}>
            Lock now
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReplacing(!replacing)}>
            {replacing ? 'Cancel' : 'Replace key'}
          </Button>
        </div>
        {replacing && (
          <div className="-mx-5 -mb-8">
            <ConnectView
              replacing
              onDone={() => {
                setReplacing(false);
                setMsg({ tone: 'info', text: 'Key replaced.' });
              }}
            />
          </div>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <h3 className="text-[14px] font-semibold">Jev model</h3>
        <p className="mt-1 text-[12.5px] text-muted">
          Pinned so scores stay comparable. Changing it re-asks Jev on the next measure.
        </p>
        <div className="mt-3 flex items-end gap-2">
          <Field className="flex-1" label="Model name" value={model} onChange={(e) => setModel(e.target.value)} spellCheck={false} />
          <Button variant="secondary" disabled={model.trim() === settings?.model} onClick={() => void save({ model })}>
            Save
          </Button>
        </div>
        <a
          href="https://docs.typesafe.ai/models"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-muted underline decoration-line underline-offset-2 hover:text-ink"
        >
          Available models <ExternalLink className="size-3" aria-hidden />
        </a>
      </Card>

      <Card className="mt-4 p-4">
        <h3 className="text-[14px] font-semibold">Your data</h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Resumes and past scores are stored in this browser only. Resume and job text go to TypeSafe when you add a resume or measure a job, and nowhere else.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              await send('cache/clear');
              setMsg({ tone: 'info', text: 'Saved scores cleared.' });
            }}
          >
            Clear saved scores
          </Button>
          <Button size="sm" variant="danger" onClick={() => setWiping(true)}>
            Delete everything
          </Button>
        </div>
        {wiping && (
          <div className="mt-3">
            <Notice
              tone="warn"
              title="Delete all Tailor data?"
              action={
                <>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={async () => {
                      await send('vault/forget');
                      await clearEverything();
                      await refresh();
                      go({ name: 'measure' });
                    }}
                  >
                    Delete everything
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setWiping(false)}>
                    Keep it
                  </Button>
                </>
              }
            >
              Removes your resumes, saved scores, and the saved key from this browser.
            </Notice>
          </div>
        )}
      </Card>

      <p className="mt-6 text-center text-[12px] text-muted">
        Tailor is open source.{' '}
        <a className="underline decoration-line underline-offset-2 hover:text-ink" href="https://docs.typesafe.ai/introduction" target="_blank" rel="noreferrer">
          How Jev works
        </a>
      </p>
    </div>
  );
}
