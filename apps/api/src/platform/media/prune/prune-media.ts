import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import * as schema from '../../db/schema';
import { DOCUMENT_SUBDIR } from '../media-store';
import {
  collectReferencedFilenames,
  DOCUMENT_REFERENCE_SOURCES,
} from './media-references';

export interface PruneResult {
  scanned: number;
  deleted: number;
  kept: number;
  /** Unreferenced but too new to delete (inside the grace window). */
  skippedYoung: number;
}

interface PruneOptions {
  mediaRoot: string;
  /** Filenames known to be in use; anything else is a deletion candidate. */
  referenced: Set<string>;
  /** By mtime, so an upload not yet saved into a body survives. */
  graceMs: number;
  /** Report what would be deleted without deleting it. */
  dryRun?: boolean;
  now?: number;
  log?: (message: string) => void;
}

/** Deletes every file nothing references that is past the grace window;
 * recomputed each run, so nothing drifts like a reference count. */
export async function pruneMediaFiles({
  mediaRoot,
  referenced,
  graceMs,
  dryRun = false,
  now = Date.now(),
  log,
}: PruneOptions): Promise<PruneResult> {
  const result: PruneResult = {
    scanned: 0,
    deleted: 0,
    kept: 0,
    skippedYoung: 0,
  };
  let names: string[];
  try {
    names = await readdir(mediaRoot);
  } catch {
    return result;
  }

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

/** Two sweeps: the image sources never see a document's row, so documents,
 * in their subdirectory, are swept against their own. */
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
    const db = drizzle({ client, schema });
    const sweep = (mediaRoot: string, referenced: Set<string>) =>
      pruneMediaFiles({
        mediaRoot,
        referenced,
        graceMs: params.graceMs,
        dryRun: params.dryRun,
        log: params.log,
      });

    const images = await sweep(
      params.mediaRoot,
      await collectReferencedFilenames(db),
    );
    const documents = await sweep(
      join(params.mediaRoot, DOCUMENT_SUBDIR),
      await collectReferencedFilenames(db, DOCUMENT_REFERENCE_SOURCES),
    );
    return addResults(images, documents);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** One log line for both sweeps of the volume. */
function addResults(a: PruneResult, b: PruneResult): PruneResult {
  return {
    scanned: a.scanned + b.scanned,
    deleted: a.deleted + b.deleted,
    kept: a.kept + b.kept,
    skippedYoung: a.skippedYoung + b.skippedYoung,
  };
}
