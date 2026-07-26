/**
 * MediaStore port. Uploaded editor/catalog images go through this interface;
 * the concrete backend is a per-deployment adapter (a mounted volume by
 * default). Inject with the MEDIA_STORE token.
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

export interface MediaStore {
  /**
   * Persists an image and returns its stable URL. `bytes` are the final,
   * processed bytes; `ext` the extension they were encoded to (`webp`). The
   * stored filename is `<contenthash>.<ext>`.
   */
  put(input: { bytes: Buffer; ext: string }): Promise<StoredImage>;
}

export const MEDIA_STORE = 'MEDIA_STORE';

/** Public path prefix; must stay in sync with the sanitizer's src guard. */
export const MEDIA_URL_PREFIX = '/media';
