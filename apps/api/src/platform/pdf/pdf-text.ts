/** The keys of `texts/pdf.json` no area claims: the file is the documents'
 * wording, and each area's documents are its own block. */
export const pdfTextShape = {};

/** The whole validated file; an area reads its block with `pdfTextBlock`. */
export type PdfText = Readonly<Record<string, unknown>>;

export const PDF_TEXT = 'PDF_TEXT';

/** An area's block of the PDF text, checked with the whole file at boot. */
export function pdfTextBlock<T>(text: PdfText, area: string): T {
  return (text as unknown as Record<string, T>)[area];
}
