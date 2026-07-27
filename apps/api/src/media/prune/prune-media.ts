import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Client } from 'pg';
import { collectReferencedFilenames } from './media-references';

export interface PruneResult {
  scanned: number;
  deleted: number;
  kept: number;
  /** Unreferenced but too new to delete (inside the grace window). */
  skippedYoung: number;
}

export interface PruneOptions {
  mediaRoot: string;
  /** Filenames known to be in use; anything else is a deletion candidate. */
  referenced: Set<string>;
  /** A file unreferenced but younger than this (by mtime) is left alone, so an
   * upload not yet saved into a body is never swept mid-edit. */
  graceMs: number;
  /** Report what would be deleted without deleting it. */
  dryRun?: boolean;
  now?: number;
  log?: (message: string) => void;
}

/**
 * The mark-and-sweep itself, pure over the filesystem: delete every file in
 * mediaRoot that no source references and that is older than the grace window.
 * Truth is recomputed from `referenced` each run, so nothing can drift the way a
 * reference counter would.
 */
export async function pruneMediaFiles({
  mediaRoot,
  referenced,
  graceMs,
  dryRun = false,
  now = Date.now(),
  log,
}: PruneOptions): Promise<PruneResult> {
  let names: string[];
  try {
    names = await readdir(mediaRoot);
  } catch {
    return { scanned: 0, deleted: 0, kept: 0, skippedYoung: 0 };
  }

  const result: PruneResult = {
    scanned: 0,
    deleted: 0,
    kept: 0,
    skippedYoung: 0,
  };

  for (const name of names) {
    const path = join(mediaRoot, name);
    const info = await stat(path);
    if (!info.isFile()) {
      continue;
    }
    result.scanned++;

    if (referenced.has(name)) {
      result.kept++;
      continue;
    }
    if (now - info.mtimeMs < graceMs) {
      result.skippedYoung++;
      continue;
    }

    if (!dryRun) {
      await rm(path, { force: true });
    }
    result.deleted++;
    log?.(`${dryRun ? 'would prune' : 'pruned'} ${name}`);
  }

  return result;
}

/**
 * Connect, collect references from every registered source, sweep, disconnect.
 */
export async function runMediaPrune(params: {
  connectionString: string;
  mediaRoot: string;
  graceMs: number;
  dryRun?: boolean;
  log?: (message: string) => void;
}): Promise<PruneResult> {
  const client = new Client({ connectionString: params.connectionString });
  try {
    await client.connect();
    const referenced = await collectReferencedFilenames(client);
    return await pruneMediaFiles({
      mediaRoot: params.mediaRoot,
      referenced,
      graceMs: params.graceMs,
      dryRun: params.dryRun,
      log: params.log,
    });
  } finally {
    await client.end().catch(() => undefined);
  }
}
