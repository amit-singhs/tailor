/**
 * Turns a resume file into plain text, entirely inside the browser.
 * PDF via pdf.js (bundled; its worker is packaged with the extension),
 * DOCX via mammoth, and plain text or Markdown as-is.
 */
import { normalizeText } from '../text';
import { AppError } from '../types';

export const ACCEPT = '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
const MAX_BYTES = 8 * 1024 * 1024;

async function pdfToText(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const task = pdfjs.getDocument({ data, disableFontFace: true });
  const doc = await task.promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    let line = '';
    const lines: string[] = [];
    for (const item of content.items) {
      if (!('str' in item)) continue;
      line += item.str;
      if (item.hasEOL) {
        lines.push(line);
        line = '';
      } else if (item.str && !item.str.endsWith(' ')) {
        line += ' ';
      }
    }
    if (line) lines.push(line);
    pages.push(lines.join('\n'));
  }
  await task.destroy();
  return pages.join('\n\n');
}

async function docxToText(data: ArrayBuffer): Promise<string> {
  const mammoth = await import('mammoth');
  const { value } = await mammoth.extractRawText({ arrayBuffer: data });
  return value;
}

export async function parseResumeFile(file: File): Promise<string> {
  if (file.size > MAX_BYTES) throw new AppError('INVALID_INPUT', 'That file is larger than 8 MB. Use a smaller export of your resume.');
  const name = file.name.toLowerCase();
  let text: string;
  try {
    if (name.endsWith('.pdf') || file.type === 'application/pdf') text = await pdfToText(await file.arrayBuffer());
    else if (name.endsWith('.docx')) text = await docxToText(await file.arrayBuffer());
    else if (name.endsWith('.txt') || name.endsWith('.md') || file.type.startsWith('text/')) text = await file.text();
    else throw new AppError('INVALID_INPUT', 'Use a PDF, DOCX, TXT, or Markdown file.');
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('INVALID_INPUT', 'Couldn’t read that file. If it’s a scanned PDF, paste the resume text instead.');
  }
  const clean = normalizeText(text);
  if (clean.length < 200) {
    throw new AppError('INVALID_INPUT', 'Found almost no text in that file. If it’s a scanned PDF, paste the resume text instead.');
  }
  return clean;
}
