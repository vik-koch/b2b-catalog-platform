import sharp, { Sharp } from 'sharp';
import { CatalogImage } from '@b2b-catalog-platform/shared';
import { PictureSeed } from './bundle';
import { FULL_PX, storeImage, THUMB_PX } from './catalog-placeholders';

/**
 * Whether the seed downloads the bundle's photos, or draws a placeholder for
 * every picture. The e2e suites seed placeholders: a test run must not depend
 * on the network or on a library keeping a file online.
 */
export type PictureMode = 'download' | 'placeholder';

const DOWNLOAD_TIMEOUT_MS = 30_000;

/**
 * The bundle's photos, downloaded once per URL and stored as an upload would
 * be: square, at the catalog's two sizes, WebP, content-addressed. A photo that
 * cannot be had is reported and left to the caller's placeholder — a dead link
 * in a demo costs one picture, not the seed.
 */
export class CatalogPhotos {
  private readonly downloads = new Map<string, Promise<Buffer | null>>();

  constructor(
    private readonly mediaRoot: string,
    private readonly mode: PictureMode,
  ) {}

  /** The stored pair for a photo, or null where a placeholder has to stand in. */
  async store(picture: PictureSeed): Promise<CatalogImage | null> {
    if (this.mode === 'placeholder' || !picture.url) return null;
    const bytes = await this.download(picture.url);
    if (!bytes) return null;
    try {
      const square = await squareOf(bytes, picture);
      const [full, thumb] = await Promise.all(
        [FULL_PX, THUMB_PX].map(async (px) =>
          storeImage(
            this.mediaRoot,
            await square.clone().resize(px, px).webp().toBuffer(),
          ),
        ),
      );
      return { full, thumb };
    } catch (error) {
      console.warn(`Seed photo ${picture.url} is not a usable image: ${error}`);
      return null;
    }
  }

  private download(url: string): Promise<Buffer | null> {
    let pending = this.downloads.get(url);
    if (!pending) {
      pending = fetchImage(url);
      this.downloads.set(url, pending);
    }
    return pending;
  }
}

async function fetchImage(url: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !type.startsWith('image/')) {
      console.warn(`Seed photo ${url}: ${response.status} ${type}`);
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.warn(`Seed photo ${url}: ${error}`);
    return null;
  }
}

/**
 * The picture's square, upright and tinted, still to be sized. The crop is
 * clamped into the photo, so a box authored against a slightly different
 * rendition of it still lands inside.
 */
async function squareOf(bytes: Buffer, picture: PictureSeed): Promise<Sharp> {
  // Oriented first, so the crop is measured on the photo as it is seen.
  const { data, info } = await sharp(bytes)
    .rotate()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const shorter = Math.min(info.width, info.height);
  const crop = picture.crop ?? {
    size: 1,
    x: (1 - shorter / info.width) / 2,
    y: (1 - shorter / info.height) / 2,
  };
  const side = Math.max(1, Math.round(crop.size * shorter));
  const left = Math.min(Math.round(crop.x * info.width), info.width - side);
  const top = Math.min(Math.round(crop.y * info.height), info.height - side);

  const image = sharp(data, {
    raw: { width: info.width, height: info.height, channels: info.channels },
  }).extract({ left, top, width: side, height: side });
  return picture.tint ? image.tint(picture.tint) : image;
}
