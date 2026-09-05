/**
 * MediaStore port. Uploaded editor/catalog images and product documents go
 * through this interface; the concrete backend is a per-deployment adapter (a
 * mounted volume by default). Inject with the MEDIA_STORE token.
 *
 * The port takes already-processed bytes — role, content sniffing, size cap and
 * re-encoding are the caller's job — and owns storage identity: it
 * content-hashes the bytes so the same image is stored once and its URL is
 * immutable.
 */
export interface StoredImage {
  /** Same-origin URL under /media/, e.g. "/media/9f3ac1b20e4d.webp". */
  readonly url: string;
}

export interface StoredDocument {
  /** Same-origin URL under /documents/, e.g. "/documents/9f3ac1b20e4d.pdf". */
  readonly url: string;
}

export interface MediaStore {
  /**
   * Persists an image and returns its stable URL. `bytes` are the final,
   * processed bytes; `ext` the extension they were encoded to (`webp`). The
   * stored filename is `<contenthash>.<ext>`.
   */
  put(input: { bytes: Buffer; ext: string }): Promise<StoredImage>;

  /**
   * Persists a document's bytes **exactly as received** and returns its stable
   * URL. A document that is not byte-identical is not a certificate, so this is
   * a second method rather than a flag on `put`: the pipeline whose whole job
   * is to touch the bytes never sees them.
   */
  putDocument(input: { bytes: Buffer; ext: string }): Promise<StoredDocument>;
}

export const MEDIA_STORE = 'MEDIA_STORE';

/**
 * The subdirectory of the store's root that documents are written to. A
 * directory rather than a second volume: both kinds are backed up, restored and
 * served by the same machinery, and only their URL prefix and their pipeline
 * differ. The prune sweep needs it too, which is why it lives with the port
 * rather than inside the local adapter.
 */
export const DOCUMENT_SUBDIR = 'documents';
