import { mkdtemp, readdir, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pruneMediaFiles } from './prune-media';

describe('pruneMediaFiles', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'prune-'));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  // Writes a file and back-dates its mtime so the grace check treats it as old.
  const writeOld = async (name: string, ageMs: number): Promise<void> => {
    const path = join(root, name);
    await writeFile(path, 'x');
    const when = new Date(Date.now() - ageMs);
    await utimes(path, when, when);
  };

  const GRACE = 60 * 60 * 1000; // 1h

  it('deletes an unreferenced file older than the grace window', async () => {
    await writeOld('orphan.webp', GRACE * 2);
    const result = await pruneMediaFiles({
      mediaRoot: root,
      referenced: new Set(),
      graceMs: GRACE,
    });
    expect(result).toMatchObject({ scanned: 1, deleted: 1, kept: 0 });
    expect(await readdir(root)).toEqual([]);
  });

  it('keeps a referenced file however old', async () => {
    await writeOld('used.webp', GRACE * 100);
    const result = await pruneMediaFiles({
      mediaRoot: root,
      referenced: new Set(['used.webp']),
      graceMs: GRACE,
    });
    expect(result).toMatchObject({ deleted: 0, kept: 1 });
    expect(await readdir(root)).toEqual(['used.webp']);
  });

  it('spares an unreferenced file still inside the grace window', async () => {
    await writeOld('fresh.webp', GRACE / 2);
    const result = await pruneMediaFiles({
      mediaRoot: root,
      referenced: new Set(),
      graceMs: GRACE,
    });
    expect(result).toMatchObject({ deleted: 0, skippedYoung: 1 });
    expect(await readdir(root)).toEqual(['fresh.webp']);
  });

  it('reports candidates without deleting in dry-run mode', async () => {
    await writeOld('orphan.webp', GRACE * 2);
    const result = await pruneMediaFiles({
      mediaRoot: root,
      referenced: new Set(),
      graceMs: GRACE,
      dryRun: true,
    });
    expect(result).toMatchObject({ deleted: 1 });
    expect(await readdir(root)).toEqual(['orphan.webp']);
  });

  it('returns an empty result when the media root does not exist', async () => {
    const result = await pruneMediaFiles({
      mediaRoot: join(root, 'missing'),
      referenced: new Set(),
      graceMs: GRACE,
    });
    expect(result).toEqual({
      scanned: 0,
      deleted: 0,
      kept: 0,
      skippedYoung: 0,
    });
  });
});
