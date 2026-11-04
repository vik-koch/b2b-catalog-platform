import sharp from 'sharp';

/** A real PNG upload, `width` by `height`. */
export async function pngUpload(
  width = 8,
  height = 8,
): Promise<Express.Multer.File> {
  const buffer = await sharp({
    create: { width, height, channels: 3, background: '#334455' },
  })
    .png()
    .toBuffer();
  return {
    buffer,
    size: buffer.length,
    originalname: 'x.png',
  } as Express.Multer.File;
}
