import {
  BadRequestException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { MEDIA_MAX_UPLOAD_BYTES } from '@b2b-catalog-platform/shared/platform';
import { readImageUpload } from './image-upload';
import { pngUpload } from './upload.fixture';

describe('readImageUpload', () => {
  it('passes an image with the type sniffed from its bytes', async () => {
    const { mime } = await readImageUpload(await pngUpload());

    expect(mime).toBe('image/png');
  });

  it('rejects a missing file', async () => {
    await expect(readImageUpload(undefined)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a payload over the size cap', async () => {
    const file = {
      buffer: Buffer.alloc(10),
      size: MEDIA_MAX_UPLOAD_BYTES + 1,
      originalname: 'big.png',
    } as Express.Multer.File;

    await expect(readImageUpload(file)).rejects.toThrow(
      PayloadTooLargeException,
    );
  });

  it('rejects a renamed SVG by content sniffing', async () => {
    const svg = {
      buffer: Buffer.from('<svg><script>alert(1)</script></svg>'),
      size: 36,
      originalname: 'logo.png',
    } as Express.Multer.File;

    await expect(readImageUpload(svg)).rejects.toThrow(
      UnsupportedMediaTypeException,
    );
  });
});
