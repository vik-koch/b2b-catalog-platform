import { AcceptedDocumentMime } from '@b2b-catalog-platform/shared';
import { sniffAcceptedImage } from './image-content-type';

/** Every PDF starts with this signature, version bytes aside. */
const PDF_MAGIC = Buffer.from('%PDF-');

/** Extension per accepted type. The stored name is a content hash, so this is
 * what tells a browser — and the operator browsing the volume — what the file
 * is; nothing reads the type back out of it. */
const MIME_TO_EXT: Record<AcceptedDocumentMime, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

export function documentExtension(mime: AcceptedDocumentMime): string {
  return MIME_TO_EXT[mime];
}

/**
 * The real type of an uploaded document, from the bytes alone — the declared
 * Content-Type and the filename are the client's claims and are never trusted.
 *
 * A PDF is recognised by its signature rather than parsed: nothing here renders
 * it, and the point of the check is that a file served same-origin is one of
 * the types this shop admits, not that it is a well-formed document. Images go
 * through the same sniff the media upload uses, so the two allowlists cannot
 * drift apart.
 */
export async function sniffAcceptedDocument(
  bytes: Buffer,
): Promise<AcceptedDocumentMime | null> {
  if (bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'application/pdf';
  }
  return sniffAcceptedImage(bytes);
}
