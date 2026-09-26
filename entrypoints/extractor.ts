import { extractJob } from '@/lib/job/extract';

/**
 * Injected on demand by the side panel (never declared as an always-on content
 * script). Leaves its result on a private global that the panel reads back and
 * deletes in a second, tiny injection.
 */
export default defineUnlistedScript(() => {
  (globalThis as unknown as { __tailorJob?: unknown }).__tailorJob = extractJob(document);
});
