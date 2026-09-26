import { q, textOf, type SiteAdapter } from './types';

export const linkedin: SiteAdapter = {
  id: 'linkedin',
  host: /(^|\.)linkedin\.com$/,
  extract(doc) {
    const root = q(doc, [
      '.jobs-description__content .jobs-box__html-content',
      '.jobs-description-content__text',
      '.jobs-description__content',
      '#job-details',
      '.description__text', // public (logged-out) job pages
      '[class*="jobs-description"]',
    ]);
    if (!root) return null;
    return {
      root,
      title: textOf(q(doc, ['.job-details-jobs-unified-top-card__job-title', '.jobs-unified-top-card__job-title', '.top-card-layout__title', 'h1'])),
      company: textOf(q(doc, ['.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name', '.topcard__org-name-link'])),
    };
  },
};

export const naukri: SiteAdapter = {
  id: 'naukri',
  host: /(^|\.)naukri\.com$/,
  extract(doc) {
    const root = q(doc, ['[class*="JDC__dang-inner-html"]', '[class*="job-desc-container"]', '[class*="job-desc"]', 'section[class*="JDC"]']);
    if (!root) return null;
    const keySkills = [...doc.querySelectorAll('[class*="key-skill"] a, [class*="key-skill"] span, [class*="chip-clickable"]')]
      .map((e) => textOf(e))
      .filter(Boolean)
      .join(', ');
    const base = (root as HTMLElement).innerText ?? root.textContent ?? '';
    return {
      text: keySkills ? `${base}\n\nKey skills: ${keySkills}` : base,
      title: textOf(q(doc, ['h1[class*="jd-header-title"]', 'h1'])),
      company: textOf(q(doc, ['[class*="jd-header-comp-name"] a', '[class*="comp-name"]'])),
    };
  },
};

export const indeed: SiteAdapter = {
  id: 'indeed',
  host: /(^|\.)indeed\.[a-z.]+$/,
  extract(doc) {
    const root = q(doc, ['#jobDescriptionText', '[data-testid="jobsearch-JobComponent-description"]']);
    if (!root) return null;
    return {
      root,
      title: textOf(q(doc, ['[data-testid="jobsearch-JobInfoHeader-title"]', 'h1', 'h2.jobsearch-JobInfoHeader-title'])),
      company: textOf(q(doc, ['[data-testid="inlineHeader-companyName"]', '[data-company-name]'])),
    };
  },
};

export const greenhouse: SiteAdapter = {
  id: 'greenhouse',
  host: /(^|\.)greenhouse\.io$/,
  extract(doc) {
    const root = q(doc, ['.job__description', '#content .job-post-content', '#content', '.job-post']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['.job__title h1', 'h1.app-title', 'h1'])), company: textOf(q(doc, ['.company-name'])) };
  },
};

export const lever: SiteAdapter = {
  id: 'lever',
  host: /(^|\.)lever\.co$/,
  extract(doc) {
    const root = q(doc, ['[data-qa="job-description"]', '.posting-page .content', '.posting']);
    if (!root) return null;
    const lists = [...doc.querySelectorAll('.posting .section.page-centered')].map((e) => (e as HTMLElement).innerText).join('\n\n');
    return { text: lists || (root as HTMLElement).innerText, title: textOf(q(doc, ['.posting-headline h2', 'h2'])) };
  },
};

export const workday: SiteAdapter = {
  id: 'workday',
  host: /(^|\.)(myworkdayjobs|workday)\.com$/,
  extract(doc) {
    const root = q(doc, ['[data-automation-id="jobPostingDescription"]', '[data-automation-id="job-posting-details"]']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['[data-automation-id="jobPostingHeader"]', 'h2', 'h1'])) };
  },
};

export const ashby: SiteAdapter = {
  id: 'ashby',
  host: /(^|\.)ashbyhq\.com$/,
  extract(doc) {
    const root = q(doc, ['[class*="_descriptionText"]', '[class*="descriptionText"]', '[class*="job-posting-description"]']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['h1'])) };
  },
};

export const glassdoor: SiteAdapter = {
  id: 'glassdoor',
  host: /(^|\.)glassdoor\.[a-z.]+$/,
  extract(doc) {
    const root = q(doc, ['[class*="JobDetails_jobDescription"]', '[data-test="jobDescriptionContent"]', '.jobDescriptionContent']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['[data-test="job-title"]', 'h1'])), company: textOf(q(doc, ['[data-test="employer-name"]'])) };
  },
};

export const wellfound: SiteAdapter = {
  id: 'wellfound',
  host: /(^|\.)(wellfound|angel)\.co(m)?$/,
  extract(doc) {
    const root = q(doc, ['[class*="description"]', '[data-test="JobDescription"]']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['h1'])) };
  },
};

export const instahyre: SiteAdapter = {
  id: 'instahyre',
  host: /(^|\.)instahyre\.com$/,
  extract(doc) {
    const root = q(doc, ['.job-details', '[class*="job-description"]']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['h1'])) };
  },
};

export const smartrecruiters: SiteAdapter = {
  id: 'smartrecruiters',
  host: /(^|\.)smartrecruiters\.com$/,
  extract(doc) {
    const root = q(doc, ['.job-sections', '[itemprop="description"]']);
    if (!root) return null;
    return { root, title: textOf(q(doc, ['h1.job-title', 'h1'])) };
  },
};
