/**
 * Side panel side of job reading: injects the extractor into the active tab,
 * collects its result, and turns permission problems into clear next steps.
 */
import { browser } from 'wxt/browser';
import { sha256Hex } from '../text';
import { AppError, type JobPosting } from '../types';
import type { ExtractResult } from './extract';

export const ALL_SITES = { origins: ['https://*/*', 'http://*/*'] };

export async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const BLOCKED = /^(chrome|edge|brave|about|moz-extension|chrome-extension|view-source|devtools):|^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com|addons\.mozilla\.org)/;

export async function hasAllSitesPermission(): Promise<boolean> {
  return browser.permissions.contains(ALL_SITES);
}

/** Must be called from a click handler (browsers require a user gesture). */
export async function requestAllSitesPermission(): Promise<boolean> {
  return browser.permissions.request(ALL_SITES);
}

async function runExtractor(tabId: number, allFrames: boolean): Promise<ExtractResult[]> {
  await browser.scripting.executeScript({ target: { tabId, allFrames }, files: ['/extractor.js'] });
  const results = await browser.scripting.executeScript({
    target: { tabId, allFrames },
    func: () => {
      const g = globalThis as unknown as { __tailorJob?: unknown };
      const r = g.__tailorJob;
      delete g.__tailorJob;
      return r ?? null;
    },
  });
  return results.map((r) => r.result as ExtractResult | null).filter((r): r is ExtractResult => !!r);
}

export async function readJobFromActiveTab(): Promise<JobPosting> {
  const tab = await activeTab();
  if (!tab?.id) throw new AppError('NO_JOB_FOUND', 'No active tab to read.');
  if (tab.url && BLOCKED.test(tab.url)) {
    throw new AppError('PAGE_BLOCKED', 'Browsers don’t let extensions read this page. Open a job posting and measure again.');
  }

  let results: ExtractResult[];
  try {
    // Job boards sometimes embed the posting in an iframe (e.g. Greenhouse on a company site).
    results = await runExtractor(tab.id, true).catch(() => runExtractor(tab.id!, false));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/cannot access|permission|host|activeTab|not allowed/i.test(msg)) {
      throw new AppError('PERMISSION_NEEDED', 'Tailor needs permission to read this page.');
    }
    if (/cannot be scripted|extensions gallery|chrome:\/\//i.test(msg)) {
      throw new AppError('PAGE_BLOCKED', 'Browsers don’t let extensions read this page. Open a job posting and measure again.');
    }
    throw new AppError('UNKNOWN', `Couldn’t read the page: ${msg}`);
  }

  const good = results.filter((r): r is Extract<ExtractResult, { ok: true }> => r.ok);
  if (good.length === 0) {
    const first = results[0];
    throw new AppError('NO_JOB_FOUND', first && !first.ok ? first.message : 'Couldn’t find a job description on this page. Select the description text, then measure again.');
  }
  // Prefer a selection, then site-specific and structured sources, then the longest text.
  const rank = (s: string) => (s === 'selection' ? 0 : s.startsWith('adapter:') ? 1 : s === 'json-ld' ? 2 : 3);
  good.sort((a, b) => rank(a.job.source) - rank(b.job.source) || b.job.text.length - a.job.text.length);
  const job = good[0]!.job;
  return { ...job, hash: (await sha256Hex(job.text)).slice(0, 32) };
}
