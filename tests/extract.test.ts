// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { extractJob } from '../lib/job/extract';

const setURL = (url: string) => (window as unknown as { happyDOM: { setURL(u: string): void } }).happyDOM.setURL(url);

function load(fixture: string, url: string) {
  const html = readFileSync(resolve(__dirname, 'fixtures', fixture), 'utf8');
  setURL(url);
  document.documentElement.innerHTML = html.replace(/^[\s\S]*?<html[^>]*>/i, '').replace(/<\/html>\s*$/i, '');
}

describe('extractJob', () => {
  it('uses the LinkedIn adapter and drops page chrome', () => {
    load('linkedin.html', 'https://www.linkedin.com/jobs/view/123');
    const r = extractJob(document);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job.source).toBe('adapter:linkedin');
    expect(r.job.title).toBe('Staff Engineer');
    expect(r.job.company).toBe('Acme');
    expect(r.job.text).toContain('Kubernetes');
    expect(r.job.text).not.toContain('People also viewed');
  });

  it('reads schema.org JobPosting data inside @graph', () => {
    load('jsonld.html', 'https://careers.globex.com/jobs/9');
    const r = extractJob(document);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job.source).toBe('json-ld');
    expect(r.job.title).toBe('Data Engineer');
    expect(r.job.company).toBe('Globex');
    expect(r.job.text).toContain('Airflow');
  });

  it('falls back to the block that reads most like a job description', () => {
    load('generic.html', 'https://initech.io/careers/designer');
    const r = extractJob(document);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.job.source).toBe('heuristic');
    expect(r.job.text).toContain('usability testing');
    expect(r.job.text).not.toContain('Twitter');
  });

  it('explains what to do when nothing looks like a job', () => {
    setURL('https://example.com/');
    document.body.innerHTML = '<p>Hello world</p>';
    const r = extractJob(document);
    expect(r.ok).toBe(false);
  });
});
