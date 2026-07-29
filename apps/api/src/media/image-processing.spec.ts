import sharp from 'sharp';
import {
  MEDIA_CATALOG_FULL_WIDTH,
  MEDIA_CATALOG_THUMB_WIDTH,
  MEDIA_MAX_IMAGE_WIDTH,
} from '@b2b-catalog-platform/shared';
import { processImage } from './image-processing';

const solidPng = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#557799' } })
    .png()
    .toBuffer();

describe('processImage', () => {
  it('re-encodes any accepted input to WebP', async () => {
    const out = await processImage(await solidPng(100, 100), 'image/png');
    expect((await sharp(out).metadata()).format).toBe('webp');
  });

  it('caps the width at MEDIA_MAX_IMAGE_WIDTH', async () => {
    const out = await processImage(await solidPng(3000, 2000), 'image/png');
    expect((await sharp(out).metadata()).width).toBe(MEDIA_MAX_IMAGE_WIDTH);
  });

  it('never enlarges an image already under the cap', async () => {
    const out = await processImage(await solidPng(200, 150), 'image/png');
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it('caps at an explicit width (the catalog full/thumb profiles)', async () => {
    const src = await solidPng(3000, 2000);
    const full = await processImage(src, 'image/png', MEDIA_CATALOG_FULL_WIDTH);
    const thumb = await processImage(
      src,
      'image/png',
      MEDIA_CATALOG_THUMB_WIDTH,
    );

    expect((await sharp(full).metadata()).width).toBe(MEDIA_CATALOG_FULL_WIDTH);
    expect((await sharp(thumb).metadata()).width).toBe(
      MEDIA_CATALOG_THUMB_WIDTH,
    );
  });
});
