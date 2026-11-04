/** The store for uploaded images and documents. It takes checked, final bytes
 * and owns their names; sniffing, size caps and re-encoding are the caller's. */

export interface StoredImage {
  /** Same-origin URL under /media/, e.g. "/media/9f3ac1b20e4d.webp". */
  readonly url: string;
}

export interface StoredDocument {
  /** Same-origin URL under /documents/, e.g. "/documents/9f3ac1b20e4d.pdf". */
  readonly url: string;
}

export interface MediaStore {
  /** Stored as `<contenthash>.<ext>`. */
  put(input: { bytes: Buffer; ext: string }): Promise<StoredImage>;

  /** Stored exactly as received: a certificate that is not byte-identical is
   * not the certificate. */
  putDocument(input: { bytes: Buffer; ext: string }): Promise<StoredDocument>;

  /** Bytes no URL reaches, such as order documents naming a customer: only
   * the API reads them back, by key. */
  putPrivate(input: { bytes: Buffer; ext: string }): Promise<{ key: string }>;

  /** Reads a private file back. Rejects if the key names nothing. */
  readPrivate(key: string): Promise<Buffer>;

  /** Succeeds where the file is already gone, so a half-failed delete never
   * leaves its row behind. */
  deletePrivate(key: string): Promise<void>;
}

export const MEDIA_STORE = 'MEDIA_STORE';

/** Beside the port rather than in the adapter, as the prune sweep reads it. */
export const DOCUMENT_SUBDIR = 'documents';

/** Not routed by the media server, and skipped by the sweep. */
export const PRIVATE_SUBDIR = 'private';
