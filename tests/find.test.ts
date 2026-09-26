import { describe, expect, it } from 'vitest';
import { findResumeCandidates, findSkillsSectionTerms, findTaxonomySkills, resolveSkillName } from '../lib/skills/find';
import { TAXONOMY } from '../lib/skills/taxonomy';

const ids = (text: string) => findTaxonomySkills(text).map((c) => c.id);

describe('taxonomy', () => {
  it('has unique ids', () => {
    const seen = new Set<string>();
    for (const t of TAXONOMY) {
      expect(seen.has(t.id), `duplicate id ${t.id}`).toBe(false);
      seen.add(t.id);
    }
  });
  it('has no alias claimed by two skills', () => {
    const owner = new Map<string, string>();
    for (const t of TAXONOMY) {
      for (const term of [t.name, ...(t.aliases ?? [])]) {
        const k = term.toLowerCase();
        const prev = owner.get(k);
        expect(prev === undefined || prev === t.id, `"${term}" in ${prev} and ${t.id}`).toBe(true);
        owner.set(k, t.id);
      }
    }
  });
});

describe('findTaxonomySkills', () => {
  it('finds names and aliases', () => {
    const found = ids('Built APIs in NodeJS and Python3 with PostgreSQL on AWS, deployed with K8s.');
    expect(found).toEqual(expect.arrayContaining(['node-js', 'python', 'postgresql', 'aws', 'kubernetes']));
  });
  it('handles symbols in names', () => {
    expect(ids('Wrote C++ and C# services, some C.')).toEqual(expect.arrayContaining(['cplusplus', 'csharp', 'c']));
    expect(ids('Worked with .NET Core')).toContain('net');
  });
  it('does not match inside other words', () => {
    expect(ids('HTML and XML')).not.toContain('machine-learning');
    expect(ids('JavaScript developer')).not.toContain('java');
  });
  it('keeps case-sensitive names strict', () => {
    expect(ids('Ready to go the extra mile')).not.toContain('go');
    expect(ids('Services in Go and Rust')).toEqual(expect.arrayContaining(['go', 'rust']));
  });
  it('allows a trailing period but not a file extension', () => {
    expect(ids('I use Python.')).toContain('python');
    expect(ids('Built with Node.js')).toContain('node-js');
  });
});

describe('skills section', () => {
  it('collects unknown terms from a skills section', () => {
    const text = 'Summary\nEngineer.\n\nSkills\nPython, Zephyr RTOS, Frobnicator Pro | Kubernetes\n\nExperience\nAcme Corp';
    const found = findSkillsSectionTerms(text, new Set(['python', 'kubernetes']));
    expect(found.map((c) => c.name)).toEqual(['Zephyr RTOS', 'Frobnicator Pro']);
  });
  it('reads inline "Tools:" lines anywhere', () => {
    const found = findSkillsSectionTerms('Tools: Retool, Obsidian', new Set());
    expect(found.map((c) => c.name)).toEqual(['Retool', 'Obsidian']);
  });
  it('combines taxonomy and section terms without duplicates', () => {
    const text = 'Technical Skills\nReactJS, Webflow, TypeScript\n';
    const names = findResumeCandidates(text).map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Webflow']));
    expect(names.filter((n) => n === 'React')).toHaveLength(1);
    expect(names).not.toContain('ReactJS');
  });
});

describe('resolveSkillName', () => {
  it('maps aliases to the taxonomy entry', () => {
    expect(resolveSkillName('golang').id).toBe('go');
    expect(resolveSkillName('  k8s ').name).toBe('Kubernetes');
  });
  it('creates custom skills for unknown names', () => {
    expect(resolveSkillName('Quantum Knitting')).toEqual({ id: 'quantum-knitting', name: 'Quantum Knitting', category: 'other' });
  });
});
