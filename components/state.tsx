import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { deleteResume as dbDelete, listResumes, putResume } from '@/lib/db';
import { send } from '@/lib/messaging';
import { getActiveResumeId, setActiveResumeId } from '@/lib/settings';
import type { Resume, Settings } from '@/lib/types';
import type { VaultStatus } from '@/lib/vault/manager';

export type View =
  | { name: 'measure' }
  | { name: 'resumes' }
  | { name: 'resume'; id: string }
  | { name: 'import' }
  | { name: 'settings' };

interface AppState {
  ready: boolean;
  vault: VaultStatus | null;
  settings: Settings | null;
  resumes: Resume[];
  activeResume: Resume | null;
  view: View;
  go(view: View): void;
  setVault(v: VaultStatus): void;
  setSettings(s: Settings): void;
  selectResume(id: string): Promise<void>;
  saveResume(r: Resume): Promise<void>;
  removeResume(id: string): Promise<void>;
  refresh(): Promise<void>;
}

const Ctx = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>({ name: 'measure' });

  const refresh = useCallback(async () => {
    const [v, s, list, active] = await Promise.all([send('vault/status'), send('settings/get'), listResumes(), getActiveResumeId()]);
    setVault(v);
    setSettings(s);
    setResumes(list);
    setActiveId(active && list.some((r) => r.id === active) ? active : list[0]?.id ?? null);
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh();
    // Re-check the lock when the panel regains focus (auto-lock may have fired).
    const onFocus = () => void send('vault/status').then(setVault).catch(() => {});
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const value = useMemo<AppState>(
    () => ({
      ready,
      vault,
      settings,
      resumes,
      activeResume: resumes.find((r) => r.id === activeId) ?? null,
      view,
      go: setView,
      setVault,
      setSettings,
      async selectResume(id) {
        setActiveId(id);
        await setActiveResumeId(id);
      },
      async saveResume(r) {
        await putResume(r);
        setResumes((prev) => {
          const i = prev.findIndex((x) => x.id === r.id);
          if (i === -1) return [...prev, r];
          const next = prev.slice();
          next[i] = r;
          return next;
        });
        if (!activeId) {
          setActiveId(r.id);
          await setActiveResumeId(r.id);
        }
      },
      async removeResume(id) {
        await dbDelete(id);
        const next = resumes.filter((r) => r.id !== id);
        setResumes(next);
        if (activeId === id) {
          const fallback = next[0]?.id ?? null;
          setActiveId(fallback);
          await setActiveResumeId(fallback);
        }
      },
      refresh,
    }),
    [ready, vault, settings, resumes, activeId, view, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp outside AppProvider');
  return v;
}
