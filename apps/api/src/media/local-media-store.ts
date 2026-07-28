import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { access, mkdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared';
import { env } from '../env';
import { MediaStore, StoredImage } from './media-store';

/**
 * Local-volume adapter for the MediaStore port. Writes to MEDIA_ROOT — a
 * mounted volume a small nginx serves read-only at /media/ (behind Traefik). The
 * durability of these files is the volume's backup story.
 */
@Injectable()
export class LocalMediaStore implements MediaStore {
  private readonly logger = new Logger('MediaStore');

  async put({
    bytes,
    ext,
  }: {
    bytes: Buffer;
    ext: string;
  }): Promise<StoredImage> {
    // Short content hash: the identity of the bytes. Same image -> same file
    // (free dedup, idempotent retries); different bytes -> different URL, so a
    // stored URL can be cached immutably.
    const id = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const filename = `${id}.${ext}`;
    const root = env.MEDIA_ROOT as string;
    const path = join(root, filename);

    // Skip the write if these exact bytes are already stored.
    if (!(await this.exists(path))) {
      await mkdir(root, { recursive: true });
      // Write to a unique temp file, then atomically rename into place, so the
      // media server never serves a half-written file and the final name
      // appears in a single step.
      const tmp = join(root, `.${filename}.${randomBytes(6).toString('hex')}`);
      await writeFile(tmp, bytes);
      await rename(tmp, path);
      this.logger.log(`Stored ${filename} (${bytes.length} bytes)`);
    }

    return { url: `${MEDIA_URL_PREFIX}/${filename}` };
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
