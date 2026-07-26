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
});
