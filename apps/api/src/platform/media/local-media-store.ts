import { createHash, randomBytes } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';

import {
  DOCUMENT_URL_PREFIX,
  MEDIA_URL_PREFIX,
} from '@b2b-catalog-platform/shared/platform';

import { env } from '../env';
import {
  DOCUMENT_SUBDIR,
  MediaStore,
  PRIVATE_SUBDIR,
  StoredDocument,
  StoredImage,
} from './media-store';

/** The MediaStore on a local volume under MEDIA_ROOT, which nginx serves
 * read-only at /media/ and /documents/. */
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
    const filename = await this.writeHashed(
      env.MEDIA_ROOT as string,
      bytes,
      ext,
    );
    return { url: `${MEDIA_URL_PREFIX}/${filename}` };
  }

  async putDocument({
    bytes,
    ext,
  }: {
    bytes: Buffer;
    ext: string;
  }): Promise<StoredDocument> {
    const root = join(env.MEDIA_ROOT as string, DOCUMENT_SUBDIR);
    const filename = await this.writeHashed(root, bytes, ext);
    return { url: `${DOCUMENT_URL_PREFIX}/${filename}` };
  }

  async putPrivate({
    bytes,
    ext,
  }: {
    bytes: Buffer;
    ext: string;
  }): Promise<{ key: string }> {
    // Random: a private file is deleted, so two orders must never share one.
    const key = `${randomBytes(16).toString('hex')}.${ext}`;
    await this.write(this.privateRoot(), key, bytes);
    return { key };
  }

  async readPrivate(key: string): Promise<Buffer> {
    return readFile(join(this.privateRoot(), this.safeKey(key)));
  }

  async deletePrivate(key: string): Promise<void> {
    await rm(join(this.privateRoot(), this.safeKey(key)), { force: true });
  }

  private privateRoot(): string {
    return join(env.MEDIA_ROOT as string, PRIVATE_SUBDIR);
  }

  /** Only `putPrivate` writes keys, but a stored value that ever gained a
   * separator must not read its way out of the directory. */
  private safeKey(key: string): string {
    if (!/^[0-9a-f]{32}\.[a-z0-9]{1,8}$/.test(key)) {
      throw new Error('Not a private file key');
    }
    return key;
  }

  /** Named by a short content hash: the same bytes are stored once, and a URL
   * never changes what it serves, so it can be cached immutably. */
  private async writeHashed(
    root: string,
    bytes: Buffer,
    ext: string,
  ): Promise<string> {
    const id = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    const filename = `${id}.${ext}`;
    if (!(await this.exists(join(root, filename)))) {
      await this.write(root, filename, bytes);
    }
    return filename;
  }

  /** Through a temp file and a rename, so nothing serves a half-written file. */
  private async write(
    root: string,
    name: string,
    bytes: Buffer,
  ): Promise<void> {
    await mkdir(root, { recursive: true });
    const tmp = join(root, `.${name}.${randomBytes(6).toString('hex')}`);
    await writeFile(tmp, bytes);
    await rename(tmp, join(root, name));
    this.logger.log(`Stored ${name} (${bytes.length} bytes)`);
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
