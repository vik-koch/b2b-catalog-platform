import {
  AcceptedDocumentMime,
  fillText,
} from '@b2b-catalog-platform/shared/platform';

/** "PDF", "PNG": the formats' own names, never worded per deployment. */
export function documentFileLabel(contentType: AcceptedDocumentMime): string {
  return contentType.split('/')[1].toUpperCase();
}

/** "example.org" rather than the whole URL; the link itself if unparsable. */
export function documentLinkHost(link: string): string {
  try {
    return new URL(link).host.replace(/^www\./, '');
  } catch {
    return link;
  }
}

/** kB below a megabyte, MB from one up. */
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
