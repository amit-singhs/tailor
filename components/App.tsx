import { FileText, Lock, Settings as SettingsIcon } from 'lucide-react';
import { send } from '@/lib/messaging';
import { ConnectView, UnlockView } from './KeyViews';
import { MeasureView } from './MeasureView';
import { ResumeImport } from './ResumeImport';
import { SettingsView } from './SettingsView';
import { ResumeDetail, ResumesView } from './SkillEditor';
import { useApp } from './state';
import { IconButton, Spinner, TapeGlyph } from './ui';

function Header() {
  const { resumes, activeResume, selectResume, go, setVault } = useApp();
  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-paper/90 px-3 py-2 backdrop-blur">
      <button type="button" onClick={() => go({ name: 'measure' })} className="flex items-center gap-1.5 rounded-lg px-1.5 py-1" aria-label="Tailor home">
        <TapeGlyph className="size-6" />
        <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">Tailor</span>
      </button>
      <div className="ml-auto flex min-w-0 items-center gap-0.5">
        {resumes.length > 0 && (
          <label className="min-w-0">
            <span className="sr-only">Resume to measure with</span>
            <select
              value={activeResume?.id ?? ''}
              onChange={(e) => void selectResume(e.target.value)}
              className="h-9 max-w-[170px] truncate rounded-[10px] border border-line bg-surface pl-2.5 pr-7 text-[13px] font-medium focus:border-focus focus:outline-none"
            >
              {resumes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <IconButton label="Resumes" onClick={() => go({ name: 'resumes' })}>
          <FileText className="size-4" />
        </IconButton>
        <IconButton label="Settings" onClick={() => go({ name: 'settings' })}>
          <SettingsIcon className="size-4" />
        </IconButton>
        <IconButton label="Lock Tailor" onClick={async () => setVault(await send('vault/lock'))}>
          <Lock className="size-4" />
        </IconButton>
      </div>
    </header>
  );
}

export function App() {
  const { ready, vault, resumes, view } = useApp();

  if (!ready || !vault) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner label="Opening Tailor" />
      </div>
    );
  }
  if (!vault.configured) return <ConnectView />;
  if (!vault.unlocked) return <UnlockView />;
  if (resumes.length === 0) return <ResumeImport onboarding />;

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        {view.name === 'measure' && <MeasureView />}
        {view.name === 'resumes' && <ResumesView />}
        {view.name === 'resume' && <ResumeDetail id={view.id} />}
        {view.name === 'import' && <ResumeImport />}
        {view.name === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
