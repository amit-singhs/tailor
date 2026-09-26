# Contributing

Thanks for helping. `npm install`, then `npm run dev` for a Chrome window with Tailor loaded and hot reload. Before opening a pull request, run `npm run check` (typecheck, tests, build).

## Add a job site adapter

Tailor reads any page through JSON-LD and a heuristic, but an adapter reads a known site precisely and grabs the title and company.

1. Add an adapter to `lib/job/adapters/sites.ts`:
   ```ts
   export const mysite: SiteAdapter = {
     id: 'mysite',
     host: /(^|\.)mysite\.com$/,
     extract(doc) {
       const root = q(doc, ['.job-description', '[data-test="description"]']);
       if (!root) return null;
       return { root, title: textOf(q(doc, ['h1'])), company: textOf(q(doc, ['.company'])) };
     },
   };
   ```
2. List it in `lib/job/adapters/index.ts`.
3. Save a trimmed copy of a real posting page to `tests/fixtures/` (remove personal data) and add a case to `tests/extract.test.ts`.

Prefer stable selectors (`id`, `data-*`, ARIA) over generated class names, and list fallbacks in order.

## Add skills to the taxonomy

Edit `lib/skills/taxonomy.ts`. One line per real skill, with spelling variants as aliases:

```ts
s('Apache Pulsar', 'backend', ['Pulsar'], { cs: true }),
```

Use `cs: true` (case-sensitive) when a name is also an ordinary word. It's fine to over-match: Jev verifies each candidate in context. `npm test` catches duplicate ids and aliases.

## Change how scoring works

All questions, rubrics, thresholds, and weights are in `lib/jev/questions.ts`; the arithmetic is in `lib/scoring/engine.ts`. Follow TypeSafe's guidance (docs.typesafe.ai): one narrow judgment per question, full meaning in `instructions` (question ids aren't sent to the model), score levels that each describe a concrete situation, and math in code. Please explain the change with before/after scores on a couple of real postings.

## Style

TypeScript strict mode. User-facing text: plain, sentence case, says what happened and what to do next.
