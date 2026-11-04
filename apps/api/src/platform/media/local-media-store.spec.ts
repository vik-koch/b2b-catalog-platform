import { rm, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../env';
import { LocalMediaStore } from './local-media-store';

const bytes = (s: string): Buffer => Buffer.from(s);

describe('LocalMediaStore', () => {
  const store = new LocalMediaStore();
  const root = env.MEDIA_ROOT as string;

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('stores the bytes under a content-hashed filename', async () => {
    const { url } = await store.put({ bytes: bytes('image'), ext: 'webp' });

    expect(url).toMatch(/^\/media\/[0-9a-f]{12}\.webp$/);
    expect(await readdir(root)).toEqual([url.replace('/media/', '')]);
  });

  it('gives different bytes different URLs', async () => {
    const a = await store.put({ bytes: bytes('one'), ext: 'webp' });
    const b = await store.put({ bytes: bytes('two'), ext: 'webp' });
    expect(a.url).not.toEqual(b.url);
  });

  it('is idempotent: re-storing the same bytes rewrites nothing', async () => {
    const input = { bytes: bytes('dedup'), ext: 'webp' };
    const first = await store.put(input);
    const path = join(root, first.url.replace('/media/', ''));
    const mtimeBefore = (await stat(path)).mtimeMs;

    const second = await store.put(input);

    // Untouched file (same mtime) proves the existing bytes were not rewritten.
    expect((await stat(path)).mtimeMs).toBe(mtimeBefore);
    expect(second.url).toBe(first.url);
    expect(await readdir(root)).toHaveLength(1);
  });

  /**
   * Private files (ADR 0052) — an order's documents, which name a customer.
   *
   * Random names rather than content hashes, unlike everything above: these
   * are deleted when they are replaced and when an account closes, and
   * de-duplication would make one order's deletion another order's problem.
   */
  describe('private files', () => {
    it('stores and reads back the exact bytes, under a random key', async () => {
      const { key } = await store.putPrivate({
        bytes: bytes('a payment slip'),
        ext: 'pdf',
      });

      expect(key).toMatch(/^[0-9a-f]{32}\.pdf$/);
      expect(await store.readPrivate(key)).toEqual(bytes('a payment slip'));
      // In a subdirectory of its own, which nothing serves.
      expect(await readdir(join(root, 'private'))).toEqual([key]);
      expect(await readdir(root)).toEqual(['private']);
    });

    it('gives identical bytes two keys', async () => {
      const input = { bytes: bytes('same'), ext: 'pdf' };
      const a = await store.putPrivate(input);
      const b = await store.putPrivate(input);

      expect(a.key).not.toEqual(b.key);
      expect(await readdir(join(root, 'private'))).toHaveLength(2);
    });

    it('deletes, and does not mind deleting twice', async () => {
      const { key } = await store.putPrivate({
        bytes: bytes('gone'),
        ext: 'pdf',
      });

      await store.deletePrivate(key);
      // The row is the record that it existed: a delete that has already
      // happened must not fail the deletion that follows it.
      await expect(store.deletePrivate(key)).resolves.toBeUndefined();
      await expect(store.readPrivate(key)).rejects.toThrow();
    });

    /** Keys are written by the store and never by a client, but a stored value
     * that ever acquired a separator must not read its way out. */
    it('refuses a key that is not one of its own', async () => {
      await expect(store.readPrivate('../deployment.json')).rejects.toThrow();
      await expect(store.deletePrivate('nested/file.pdf')).rejects.toThrow();
    });
  });
});
