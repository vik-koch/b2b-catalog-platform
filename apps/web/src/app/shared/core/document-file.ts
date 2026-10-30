import { fillText } from '@b2b-catalog-platform/shared';
import { AcceptedDocumentMime } from '@b2b-catalog-platform/shared/platform';

/** What a stored file is, in one word: "PDF", "PNG". Derived from the sniffed
 * type rather than worded per deployment — these are the formats' own names. */
export function documentFileLabel(contentType: AcceptedDocumentMime): string {
  return contentType.split('/')[1].toUpperCase();
}

/** Where a document's link leads, as a reader recognises it: "example.org",
 * not the whole URL. Falls back to the link itself if it does not parse. */
export function documentLinkHost(link: string): string {
  try {
    return new URL(link).host.replace(/^www\./, '');
  } catch {
    return link;
  }
}

/** The size, in the unit that reads as a number rather than as a digit count.
 * kB below a megabyte, MB above it, one decimal either way. */
export function documentFileSize(
  bytes: number,
  text: { kb: string; mb: string },
): string {
  const kb = bytes / 1024;
  return kb < 1024
    ? fillText(text.kb, { size: Math.max(1, Math.round(kb)) })
    : fillText(text.mb, { size: (kb / 1024).toFixed(1) });
}

/** "PDF · 240 kB": what a file is and what it weighs. */
export function documentFileCaption(
  file: { contentType: AcceptedDocumentMime; byteSize: number },
  sizes: { kb: string; mb: string },
): string {
  return `${documentFileLabel(file.contentType)} · ${documentFileSize(file.byteSize, sizes)}`;
}
