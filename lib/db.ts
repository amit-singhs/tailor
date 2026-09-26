/**
 * IndexedDB, shared by the side panel and the background (same extension origin).
 *
 * Ownership, to avoid write races:
 *  - `resumes`  : written by the side panel only.
 *  - `depth`, `jobs`, `holistic`: Jev answer caches, written by the background only.
 *    Keyed by content hashes + model, so editing a resume's skill list never
 *    invalidates them, and changing the model never mixes answers.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { JudgedChoice, JudgedScore, Resume, Seniority } from './types';

export interface DepthCache {
  key: string; // `${resumeTextHash}|${model}`
  depth: Record<string, JudgedScore>;
  seniority?: JudgedChoice<Seniority>;
  updatedAt: number;
}

export interface JobCache {
  key: string; // `${jobHash}|${model}`
  importance: Record<string, JudgedScore>;
  seniority?: JudgedChoice<Seniority>;
  isJob?: number;
  updatedAt: number;
}

export interface HolisticCache {
  key: string; // `${jobHash}|${resumeTextHash}|${model}`
  work: JudgedScore;
  domain: JudgedScore;
  dealbreaker: number;
  updatedAt: number;
}

interface TailorDB extends DBSchema {
  resumes: { key: string; value: Resume; indexes: { byUpdated: number } };
  depth: { key: string; value: DepthCache };
  jobs: { key: string; value: JobCache; indexes: { byUpdated: number } };
  holistic: { key: string; value: HolisticCache; indexes: { byUpdated: number } };
}

let dbPromise: Promise<IDBPDatabase<TailorDB>> | null = null;

export function db(): Promise<IDBPDatabase<TailorDB>> {
  dbPromise ??= openDB<TailorDB>('tailor', 1, {
    upgrade(d) {
      d.createObjectStore('resumes', { keyPath: 'id' }).createIndex('byUpdated', 'updatedAt');
      d.createObjectStore('depth', { keyPath: 'key' });
      d.createObjectStore('jobs', { keyPath: 'key' }).createIndex('byUpdated', 'updatedAt');
      d.createObjectStore('holistic', { keyPath: 'key' }).createIndex('byUpdated', 'updatedAt');
    },
  });
  return dbPromise;
}

export async function listResumes(): Promise<Resume[]> {
  const all = await (await db()).getAll('resumes');
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function getResume(id: string): Promise<Resume | undefined> {
  return (await db()).get('resumes', id);
}

export async function putResume(r: Resume): Promise<void> {
  await (await db()).put('resumes', r);
}

export async function deleteResume(id: string): Promise<void> {
  await (await db()).delete('resumes', id);
}

const CACHE_LIMIT = 300;

/** Keeps the job and holistic caches from growing without bound. */
export async function pruneCaches(): Promise<void> {
  const d = await db();
  for (const store of ['jobs', 'holistic'] as const) {
    const count = await d.count(store);
    if (count <= CACHE_LIMIT) continue;
    const tx = d.transaction(store, 'readwrite');
    let cursor = await tx.store.index('byUpdated').openCursor();
    let toDelete = count - CACHE_LIMIT;
    while (cursor && toDelete > 0) {
      await cursor.delete();
      toDelete--;
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export async function clearCaches(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear('depth'), d.clear('jobs'), d.clear('holistic')]);
}

export async function clearEverything(): Promise<void> {
  const d = await db();
  await Promise.all([d.clear('resumes'), d.clear('depth'), d.clear('jobs'), d.clear('holistic')]);
}
