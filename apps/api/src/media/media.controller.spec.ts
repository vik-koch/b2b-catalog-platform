import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import { MEDIA_MAX_UPLOAD_BYTES } from '@b2b-catalog-platform/shared';
import { MediaController } from './media.controller';
import { MediaStore } from './media-store';

const pngFile = async (): Promise<Express.Multer.File> => {
  const buffer = await sharp({
    create: { width: 8, height: 8, channels: 3, background: '#334455' },
  })
    .png()
    .toBuffer();
  return {
    buffer,
    size: buffer.length,
    originalname: 'x.png',
  } as Express.Multer.File;
};

describe('MediaController', () => {
  let store: { put: jest.Mock };
  let controller: MediaController;

  beforeEach(() => {
    store = { put: jest.fn(async () => ({ url: '/media/abc.webp' })) };
    controller = new MediaController(store as unknown as MediaStore);
  });

  it('stores a valid image as WebP and returns its URL', async () => {
    const result = await controller.upload(await pngFile());

    expect(store.put).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledWith({
      bytes: expect.any(Buffer),
      ext: 'webp',
    });
    expect(result).toEqual({ url: '/media/abc.webp' });
  });

  it('rejects a missing file', async () => {
    await expect(controller.upload(undefined)).rejects.toThrow(
      BadRequestException,
    );
    expect(store.put).not.toHaveBeenCalled();
  });

  it('rejects a payload over the size cap', async () => {
    const file = {
      buffer: Buffer.alloc(10),
      size: MEDIA_MAX_UPLOAD_BYTES + 1,
      originalname: 'big.png',
    } as Express.Multer.File;
    await expect(controller.upload(file)).rejects.toThrow(
      PayloadTooLargeException,
    );
    expect(store.put).not.toHaveBeenCalled();
  });

  it('rejects a non-image (e.g. a renamed SVG) by content sniffing', async () => {
    const svg = {
      buffer: Buffer.from('<svg><script>alert(1)</script></svg>'),
      size: 36,
      originalname: 'logo.png',
    } as Express.Multer.File;
    await expect(controller.upload(svg)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    expect(store.put).not.toHaveBeenCalled();
  });
});
