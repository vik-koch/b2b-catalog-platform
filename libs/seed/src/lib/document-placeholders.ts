import { createHash } from 'node:crypto';
import { access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DOCUMENT_URL_PREFIX } from '@b2b-catalog-platform/shared';

/**
 * Demo placeholder documents. Real certificates come from the client; until
 * then the seed writes a plain one-page PDF per document, built here rather
 * than pulled from a library — a page of text is a few objects, and a
 * dependency for the demo's sake is one the deployment would carry forever.
 *
 * Deterministic, like the image placeholders: the same title yields
 * byte-identical bytes, so a re-seed reuses the stored file rather than
 * accumulating copies of it.
 */

const DOCUMENT_SUBDIR = 'documents';

/** Escapes the characters a PDF string literal cannot carry raw. */
function pdfText(value: string): string {
  return value.replace(/([\\()])/g, '\\$1');
}

/**
 * A one-page PDF: catalog, pages, page, the text content and a base-14 font.
 * The cross-reference table is written from the real byte offsets, so the file
 * is well-formed rather than merely tolerated by a viewer.
 *
 * The text is Latin-1 — which is all Helvetica's built-in encoding covers, and
 * what keeps a character's length in the string equal to its length in the
 * file, so the offsets below stay right.
 */
export function placeholderPdf(title: string, lines: string[]): Buffer {
  const content =
    `BT /F1 20 Tf 72 720 Td (${pdfText(title)}) Tj ET\n` +
    lines
      .map(
        (line, index) =>
          `BT /F1 11 Tf 72 ${680 - index * 18} Td (${pdfText(line)}) Tj ET`,
      )
      .join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ' +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xref = pdf.length;
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets
      .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
      .join('') +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xref}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Writes a document into the store the way an upload would: content-addressed,
 * under the documents subdirectory, unmodified. Returns the stored file as a
 * document row keeps it.
 */
export async function storePlaceholderDocument(
  mediaRoot: string,
  name: string,
  bytes: Buffer,
): Promise<{ url: string; name: string; byteSize: number }> {
  const id = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
  const filename = `${id}.pdf`;
  const root = join(mediaRoot, DOCUMENT_SUBDIR);
  const path = join(root, filename);
  try {
    await access(path);
  } catch {
    await mkdir(root, { recursive: true });
    await writeFile(path, bytes);
  }
  return {
    url: `${DOCUMENT_URL_PREFIX}/${filename}`,
    name,
    byteSize: bytes.length,
  };
}
