/** Normalizes whitespace while keeping line structure (bullets and headings matter to Jev). */
export function normalizeText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200b-\u200d\ufeff]/g, '')
    .replace(/[ \t\f\v]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Trims to a character budget on a line boundary. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.lastIndexOf('\n', max);
  return text.slice(0, cut > max * 0.8 ? cut : max).trim();
}

/** Lines that are almost never about the role itself. Removing them keeps Jev's state focused. */
const BOILERPLATE = [
  /equal (employment )?opportunity/i,
  /\b(eeo|eeoc)\b/i,
  /regardless of (race|religion|gender|age)/i,
  /reasonable accommodation/i,
  /\bprivacy (policy|notice)\b/i,
  /\bcookie(s)? (policy|settings|preferences)\b/i,
  /^(apply|apply now|save|share|report this job|easy apply)$/i,
  /^show (more|less)$/i,
  /^see (more|less)$/i,
];

export function stripBoilerplate(text: string): string {
  return text
    .split('\n')
    .filter((line) => !BOILERPLATE.some((re) => re.test(line)))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/#/g, 'sharp')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uid(): string {
  return crypto.randomUUID();
}
