import { AcceptedDocumentMime, fillText } from '@b2b-catalog-platform/shared';

/** What a stored file is, in one word: "PDF", "PNG". Derived from the sniffed
 * type rather than worded per deployment — these are the formats' own names. */
export function documentFileLabel(contentType: AcceptedDocumentMime): string {
  return contentType.split('/')[1].toUpperCase();
}

/** The size, in the unit that reads as a number rather than as a digit count.
 * kB below a megabyte, MB above it, one decimal either way. */
export function documentFileSize(
  bytes: number,
  text: { sizeKb: string; sizeMb: string },
): string {
  const kb = bytes / 1024;
  return kb < 1024
    ? fillText(text.sizeKb, { size: Math.max(1, Math.round(kb)) })
    : fillText(text.sizeMb, { size: (kb / 1024).toFixed(1) });
}
