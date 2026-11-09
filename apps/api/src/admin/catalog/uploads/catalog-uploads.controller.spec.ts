import sharp from 'sharp';

import { MediaStore } from '../../../platform/media/media-store';
import { pngUpload } from '../../../platform/media/upload.fixture';
import { CatalogUploadsController } from './catalog-uploads.controller';

describe('CatalogUploadsController', () => {
  it('stores a wide upload as a square pair for a category mark', async () => {
    const store = { put: vi.fn(async () => ({ url: '/media/abc.webp' })) };
    const controller = new CatalogUploadsController(
      store as unknown as MediaStore,
    );

    const result = await controller.uploadSquareCatalogImage(
      await pngUpload(120, 40),
    );

    // Both variants square: the crop is the route's, not the browser's.
    expect(store.put).toHaveBeenCalledTimes(2);
    for (const [stored] of store.put.mock.calls as unknown as [
      { bytes: Buffer },
    ][]) {
      const meta = await sharp(stored.bytes).metadata();
      expect(meta.width).toBe(meta.height);
    }
    expect(result).toEqual({
      full: '/media/abc.webp',
      thumb: '/media/abc.webp',
    });
  });
});
