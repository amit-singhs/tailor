import type { SiteAdapter } from './types';
import { ashby, glassdoor, greenhouse, indeed, instahyre, lever, linkedin, naukri, smartrecruiters, wellfound, workday } from './sites';

/** Checked in order; the first adapter whose host matches and finds a description wins. */
export const ADAPTERS: SiteAdapter[] = [linkedin, naukri, indeed, greenhouse, lever, workday, ashby, glassdoor, wellfound, instahyre, smartrecruiters];

export type { SiteAdapter } from './types';
