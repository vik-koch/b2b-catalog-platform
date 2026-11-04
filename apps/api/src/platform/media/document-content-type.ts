import { AcceptedDocumentMime } from '@b2b-catalog-platform/shared/platform';
import { sniffAcceptedImage } from './image-content-type';

/** Every PDF starts with this signature, version bytes aside. */
const PDF_MAGIC = Buffer.from('%PDF-');

/** The stored name is a hash, so the extension is what says what a file is. */
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

/** A PDF by its signature, not parsed: the check is what may be served
 * same-origin, not whether it is well-formed. Images as the media upload. */
export async function sniffAcceptedDocument(
  bytes: Buffer,
): Promise<AcceptedDocumentMime | null> {
  if (bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'application/pdf';
  }
  return sniffAcceptedImage(bytes);
}
