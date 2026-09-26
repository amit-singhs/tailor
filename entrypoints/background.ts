import { browser } from 'wxt/browser';
import { getResume, listResumes, clearCaches } from '@/lib/db';
import { ping } from '@/lib/jev/client';
import { serve, type CompareRow } from '@/lib/messaging';
import { verifySkills, scoreFit } from '@/lib/scoring/pipeline';
import { getSettings, setSettings } from '@/lib/settings';
import { AppError } from '@/lib/types';
import * as vault from '@/lib/vault/manager';

export default defineBackground(() => {
  void vault.hardenSessionStorage();

  // Clicking the toolbar icon opens the side panel (Chrome/Edge).
  if (!import.meta.env.FIREFOX) {
    void browser.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  } else {
    browser.action.onClicked.addListener(() => {
      void (browser as unknown as { sidebarAction?: { open(): Promise<void> } }).sidebarAction?.open();
    });
  }

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === vault.AUTOLOCK_ALARM) void vault.lock();
  });

  const ctx = async () => {
    const settings = await getSettings();
    return { apiKey: await vault.useKey(settings), model: settings.model };
  };

  serve({
    'vault/status': () => vault.status(),
    'vault/setup': async ({ apiKey, passphrase }) => vault.setup(apiKey, passphrase, await getSettings()),
    'vault/unlock': async ({ passphrase }) => vault.unlock(passphrase, await getSettings()),
    'vault/lock': async () => {
      await vault.lock();
      return vault.status();
    },
    'vault/forget': async () => {
      await vault.forget();
      return vault.status();
    },

    'skills/verify': async ({ text, candidates }) => verifySkills(text, candidates, await ctx()),

    'fit/score': async ({ job, resumeId, force }) => {
      const resume = await getResume(resumeId);
      if (!resume) throw new AppError('NOT_FOUND', 'That resume no longer exists. Pick another one.');
      return scoreFit(job, resume, await ctx(), force);
    },

    'fit/compare': async ({ job }) => {
      const c = await ctx();
      const rows: CompareRow[] = [];
      // Sequential on purpose: the first run caches the job-side answers,
      // so later resumes only ask about skills that are new to them.
      for (const r of await listResumes()) {
        try {
          const fit = await scoreFit(job, r, c);
          rows.push({ resumeId: r.id, label: r.label, overall: fit.overall });
        } catch (err) {
          if (err instanceof AppError && ['AUTH', 'LOCKED', 'NETWORK', 'NOT_A_JOB'].includes(err.code)) throw err;
          rows.push({
            resumeId: r.id,
            label: r.label,
            overall: null,
            error: err instanceof AppError ? err.toJSON() : { code: 'UNKNOWN', message: String(err) },
          });
        }
      }
      return rows.sort((a, b) => (b.overall ?? -1) - (a.overall ?? -1));
    },

    'settings/get': () => getSettings(),
    'settings/set': async (patch) => {
      if (patch.model !== undefined) {
        const model = patch.model.trim();
        const current = await getSettings();
        if (model && model !== current.model) {
          const st = await vault.status();
          if (st.unlocked) await ping(await vault.useKey(current), model); // throws UNKNOWN_MODEL
        }
      }
      const next = await setSettings(patch);
      if (patch.autoLockMinutes !== undefined) await vault.reapplyAutoLock(next);
      return next;
    },
    'cache/clear': () => clearCaches(),
  });
});
