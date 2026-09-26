/**
 * A site adapter knows where a job description lives on one job site.
 * Adding a site = adding one file in this folder and listing it in index.ts.
 * Adapters run inside the page, only when you click Measure.
 */
export interface AdapterResult {
  title?: string;
  company?: string;
  /** The element holding the description, or plain text when the site splits it up. */
  root?: Element | null;
  text?: string;
}

export interface SiteAdapter {
  id: string;
  /** Hostname test, e.g. /(^|\.)linkedin\.com$/ */
  host: RegExp;
  extract(doc: Document, url: URL): AdapterResult | null;
}

export const q = (doc: ParentNode, selectors: string[]): Element | null => {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && (el.textContent ?? '').trim().length > 0) return el;
  }
  return null;
};

export const textOf = (el: Element | null | undefined): string | undefined => {
  const t = el?.textContent?.replace(/\s+/g, ' ').trim();
  return t || undefined;
};
