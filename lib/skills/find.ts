/**
 * Finds candidate skills in text. This is the "find" half of TypeSafe's
 * find-then-judge pattern: tuned to over-find, because Jev verifies every
 * candidate afterwards and can only keep what code found.
 */
import { slugify } from '../text';
import type { SkillCandidate, SkillCategory, TaxonomySkill } from '../types';
import { TAXONOMY } from './taxonomy';

interface Matcher {
  skill: TaxonomySkill;
  re: RegExp;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A term is bounded when it is not glued to letters, digits, or the symbols
// that belong inside tech names ("C" must not match inside "C++" or "C#").
// A trailing dot is fine ("Python."), but not a dot that starts an extension ("Node.js").
const LEFT = '(?<![A-Za-z0-9+#.])';
const RIGHT = '(?![A-Za-z0-9+#]|\\.[A-Za-z0-9])';

function buildMatchers(taxonomy: TaxonomySkill[]): Matcher[] {
  return taxonomy.map((skill) => {
    const terms = [skill.name, ...(skill.aliases ?? [])]
      .sort((a, b) => b.length - a.length)
      .map((t) => escape(t).replace(/\\ /g, ' ').replace(/ /g, '[\\s-]?'));
    const flags = skill.caseSensitive ? 'g' : 'gi';
    return { skill, re: new RegExp(`${LEFT}(?:${terms.join('|')})${RIGHT}`, flags) };
  });
}

let cached: Matcher[] | null = null;
const matchers = () => (cached ??= buildMatchers(TAXONOMY));

function snippetAt(text: string, index: number, length: number): string {
  const start = Math.max(0, text.lastIndexOf('\n', index) + 1, index - 60);
  const endLine = text.indexOf('\n', index + length);
  const end = Math.min(endLine === -1 ? text.length : endLine, index + length + 60);
  return text.slice(start, end).trim();
}

/** Taxonomy skills that appear in the text, in order of first appearance. */
export function findTaxonomySkills(text: string): SkillCandidate[] {
  const found: Array<SkillCandidate & { at: number }> = [];
  for (const { skill, re } of matchers()) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (!m) continue;
    found.push({
      id: skill.id,
      name: skill.name,
      category: skill.category,
      source: 'taxonomy',
      snippet: snippetAt(text, m.index, m[0].length),
      at: m.index,
    });
  }
  return found.sort((a, b) => a.at - b.at).map(({ at: _at, ...c }) => c);
}

const SECTION_HEADING = /^(technical |core |key |professional )?(skills?|skill set|skillset|technologies|tech stack|tools( (and|&) technologies)?|competencies|expertise|proficiencies|toolbox)\s*:?\s*$/i;
const INLINE_SKILLS_LINE = /^(languages|frameworks|libraries|tools|databases|cloud|platforms|technologies|skills|devops|testing|others?)\s*[:\-–]\s*(.+)$/i;
const LOOKS_LIKE_HEADING = (line: string) =>
  line.length > 0 &&
  line.length <= 40 &&
  !/[,;|•·]/.test(line) &&
  (/^[A-Z][A-Z &/]+$/.test(line) || /^[A-Z][a-zA-Z &/]+:?$/.test(line)) &&
  line.split(/\s+/).length <= 4;

const STOP = new Set([
  'and', 'or', 'etc', 'others', 'other', 'various', 'basic', 'advanced', 'intermediate', 'beginner',
  'proficient', 'familiar', 'knowledge', 'experience', 'strong', 'good', 'excellent', 'including',
  'languages', 'frameworks', 'tools', 'skills', 'technologies', 'databases', 'libraries', 'platforms',
]);

function cleanToken(t: string): string {
  return t
    .replace(/\((?:basic|advanced|intermediate|expert|proficient|familiar)[^)]*\)/gi, '')
    .replace(/^[\s\-–•·*▪◦●○■□➢►✓]+|[\s.\-–:;]+$/g, '')
    .trim();
}

/**
 * Terms listed in a resume's skills section that the taxonomy doesn't know.
 * These go to Jev for verification like any other candidate.
 */
export function findSkillsSectionTerms(text: string, known: Set<string>): SkillCandidate[] {
  const lines = text.split('\n');
  const out = new Map<string, SkillCandidate>();
  let inSection = false;
  let sectionLines = 0;

  const take = (chunk: string) => {
    for (const raw of chunk.split(/[,;|•·/]|\s+and\s+|\s{2,}/)) {
      const t = cleanToken(raw);
      if (t.length < 2 || t.length > 32) continue;
      const words = t.split(/\s+/);
      if (words.length > 4) continue;
      if (STOP.has(t.toLowerCase())) continue;
      if (!/[A-Za-z]/.test(t)) continue;
      const id = slugify(t);
      if (!id || known.has(id) || out.has(id)) continue;
      out.set(id, { id, name: t, category: 'other', source: 'skills-section', snippet: chunk.trim().slice(0, 140) });
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const inline = INLINE_SKILLS_LINE.exec(line);
    if (SECTION_HEADING.test(line)) {
      inSection = true;
      sectionLines = 0;
      continue;
    }
    if (inSection) {
      if (!line) {
        if (sectionLines > 0) inSection = false;
        continue;
      }
      if (LOOKS_LIKE_HEADING(line) && !inline) {
        inSection = false;
        continue;
      }
      sectionLines++;
      take(inline ? inline[2]! : line.replace(/^[^:]{1,30}:\s*/, ''));
      if (sectionLines > 25) inSection = false;
      continue;
    }
    if (inline) take(inline[2]!);
  }
  return [...out.values()].slice(0, 40);
}

/** All candidates for a resume: taxonomy hits first, then unknown skills-section terms. */
export function findResumeCandidates(text: string): SkillCandidate[] {
  const tax = findTaxonomySkills(text);
  const known = new Set(tax.map((c) => c.id));
  // Also treat any taxonomy alias as known, so "ReactJS" in a list isn't re-added.
  for (const t of TAXONOMY) known.add(t.id);
  const extra = findSkillsSectionTerms(text, known).filter((c) => !aliasIndex().has(c.name.toLowerCase()));
  return [...tax, ...extra];
}

let aliasIdx: Map<string, TaxonomySkill> | null = null;
function aliasIndex(): Map<string, TaxonomySkill> {
  if (aliasIdx) return aliasIdx;
  aliasIdx = new Map();
  for (const t of TAXONOMY) {
    for (const term of [t.name, ...(t.aliases ?? [])]) aliasIdx.set(term.toLowerCase(), t);
  }
  return aliasIdx;
}

/** Resolves a typed skill name to its taxonomy entry, or a custom skill. */
export function resolveSkillName(name: string): { id: string; name: string; category: SkillCategory } {
  const clean = name.trim().replace(/\s+/g, ' ');
  const hit = aliasIndex().get(clean.toLowerCase());
  if (hit) return { id: hit.id, name: hit.name, category: hit.category };
  return { id: slugify(clean), name: clean, category: 'other' };
}

export function taxonomyNames(): string[] {
  return TAXONOMY.map((t) => t.name).sort((a, b) => a.localeCompare(b));
}
