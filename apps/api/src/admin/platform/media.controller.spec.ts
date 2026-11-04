import { UnsupportedMediaTypeException } from '@nestjs/common';
import { MediaStore } from '../../platform/media/media-store';
import { pngUpload } from '../../platform/media/upload.fixture';
import { MediaController } from './media.controller';

describe('MediaController', () => {
  const setup = () => {
    const store = { put: vi.fn(async () => ({ url: '/media/abc.webp' })) };
    return {
      store,
      controller: new MediaController(store as unknown as MediaStore),
    };
  };

  it('stores a valid image as WebP and returns its URL', async () => {
    const { store, controller } = setup();

    const result = await controller.upload(await pngUpload());

    expect(store.put).toHaveBeenCalledExactlyOnceWith({
      bytes: expect.any(Buffer),
      ext: 'webp',
    });
    expect(result).toEqual({ url: '/media/abc.webp' });
  });

  it('stores nothing the gate refuses', async () => {
    const { store, controller } = setup();
    const svg = {
      buffer: Buffer.from('<svg/>'),
      size: 6,
      originalname: 'logo.png',
    } as Express.Multer.File;

    await expect(controller.upload(svg)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
    expect(store.put).not.toHaveBeenCalled();
  });
});
