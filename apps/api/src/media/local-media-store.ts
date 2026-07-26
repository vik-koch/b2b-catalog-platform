import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../env';
import { MediaStore, MEDIA_URL_PREFIX, StoredImage } from './media-store';

/**
 * Local-volume adapter for the MediaStore port. Writes to MEDIA_ROOT — a
 * mounted volume the shared Traefik serves as static files at /media/. The
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
    const path = join(env.MEDIA_ROOT as string, filename);

    // Skip the write if these exact bytes are already stored.
    if (!(await this.exists(path))) {
      await mkdir(env.MEDIA_ROOT as string, { recursive: true });
      await writeFile(path, bytes);
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
