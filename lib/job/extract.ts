/**
 * Runs inside the job page, only when you click Measure. Reads text; never
 * writes to the page, never sends anything anywhere. Layers, in order:
 *   1. Text you selected (always wins when it's long enough)
 *   2. A site adapter for known job sites
 *   3. schema.org JobPosting data (JSON-LD) that many career sites embed
 *   4. A heuristic that finds the block that reads most like a job description
 */
import { ADAPTERS } from './adapters';
import type { JobSource } from '../types';
import { normalizeText } from '../text';

export interface RawJob {
  url: string;
  title: string;
  company?: string;
  text: string;
  source: JobSource;
}

export type ExtractResult = { ok: true; job: RawJob } | { ok: false; reason: 'empty' | 'error'; message: string };

const MIN_SELECTION = 200;
const MIN_DESCRIPTION = 200;
/** Structured job data is trustworthy, so short postings are fine. */
const MIN_STRUCTURED = 120;

function visibleText(el: Element): string {
  const html = el as HTMLElement;
  return normalizeText(html.innerText ?? el.textContent ?? '');
}

function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  doc.querySelectorAll('li').forEach((li) => li.prepend('• '));
  doc.querySelectorAll('br, p, li, h1, h2, h3, h4, div').forEach((el) => el.append('\n'));
  return normalizeText(doc.body.textContent ?? '');
}

function pageTitle(doc: Document): string {
  const og = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  const h1 = doc.querySelector('h1')?.textContent;
  return normalizeText(og || h1 || doc.title || 'This job').slice(0, 160);
}

// --- JSON-LD ---------------------------------------------------------------

interface JobPostingLd {
  '@type'?: string | string[];
  title?: string;
  description?: string;
  hiringOrganization?: { name?: string } | string;
  skills?: string | string[];
  qualifications?: string | string[];
  responsibilities?: string | string[];
  experienceRequirements?: string | { description?: string };
  educationRequirements?: string | { credentialCategory?: string };
}

function isJobPosting(node: unknown): node is JobPostingLd {
  if (!node || typeof node !== 'object') return false;
  const t = (node as JobPostingLd)['@type'];
  return t === 'JobPosting' || (Array.isArray(t) && t.includes('JobPosting'));
}

function findLd(value: unknown, depth = 0): JobPostingLd | null {
  if (depth > 6 || !value || typeof value !== 'object') return null;
  if (isJobPosting(value)) return value;
  const children = Array.isArray(value) ? value : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    const hit = findLd(child, depth + 1);
    if (hit) return hit;
  }
  return null;
}

const asList = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join('\n') : v ?? '');

function fromJsonLd(doc: Document): RawJob | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? '');
    } catch {
      continue;
    }
    const ld = findLd(data);
    if (!ld?.description) continue;
    const parts = [
      htmlToText(ld.description),
      ld.responsibilities && `Responsibilities:\n${htmlToText(asList(ld.responsibilities))}`,
      ld.qualifications && `Qualifications:\n${htmlToText(asList(ld.qualifications))}`,
      ld.skills && `Skills: ${htmlToText(asList(ld.skills))}`,
      typeof ld.experienceRequirements === 'string' && `Experience: ${ld.experienceRequirements}`,
    ].filter(Boolean);
    const text = normalizeText(parts.join('\n\n'));
    if (text.length < MIN_STRUCTURED) continue;
    const org = typeof ld.hiringOrganization === 'string' ? ld.hiringOrganization : ld.hiringOrganization?.name;
    return { url: location.href, title: normalizeText(ld.title ?? pageTitle(doc)), company: org, text, source: 'json-ld' };
  }
  return null;
}

// --- Heuristic -------------------------------------------------------------

const JOB_WORDS =
  /\b(responsibilit|requirement|qualification|what you('|’)ll do|you will|about the role|about you|must have|nice to have|preferred|experience with|years of experience|skills|we('|’)re looking for|who you are|the role)/gi;

function heuristic(doc: Document): RawJob | null {
  const candidates = doc.querySelectorAll('main, article, section, div[class], div[id]');
  let best: { el: Element; score: number } | null = null;
  let checked = 0;
  for (const el of candidates) {
    if (++checked > 4000) break;
    const text = el.textContent ?? '';
    const len = text.length;
    if (len < 400 || len > 40_000) continue;
    const hits = text.match(JOB_WORDS)?.length ?? 0;
    if (hits < 2) continue;
    const linkChars = [...el.querySelectorAll('a')].reduce((n, a) => n + (a.textContent?.length ?? 0), 0);
    const linkDensity = linkChars / len;
    if (linkDensity > 0.35) continue;
    // Reward keyword density, gently prefer mid-length blocks, punish navigation-like blocks.
    const score = hits * 40 + Math.min(len, 8000) / 100 - linkDensity * 300 - Math.max(0, len - 12_000) / 200;
    if (!best || score > best.score) best = { el, score };
  }
  if (!best) return null;
  const text = visibleText(best.el);
  if (text.length < MIN_DESCRIPTION) return null;
  return { url: location.href, title: pageTitle(doc), text, source: 'heuristic' };
}

// --- Entry ------------------------------------------------------------------

export function extractJob(doc: Document = document): ExtractResult {
  try {
    const url = new URL(location.href);

    const selection = normalizeText(doc.getSelection?.()?.toString() ?? '');
    if (selection.length >= MIN_SELECTION) {
      return { ok: true, job: { url: url.href, title: pageTitle(doc), text: selection, source: 'selection' } };
    }

    for (const adapter of ADAPTERS) {
      if (!adapter.host.test(url.hostname)) continue;
      const r = adapter.extract(doc, url);
      const text = normalizeText(r?.text ?? (r?.root ? visibleText(r.root) : ''));
      if (r && text.length >= MIN_DESCRIPTION) {
        return {
          ok: true,
          job: {
            url: url.href,
            title: normalizeText(r.title ?? pageTitle(doc)),
            company: r.company,
            text,
            source: `adapter:${adapter.id}`,
          },
        };
      }
    }

    const ld = fromJsonLd(doc);
    if (ld) return { ok: true, job: ld };

    const h = heuristic(doc);
    if (h) return { ok: true, job: h };

    return {
      ok: false,
      reason: 'empty',
      message: 'Couldn’t find a job description on this page. Select the description text, then measure again.',
    };
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}
