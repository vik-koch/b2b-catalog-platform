import sharp from 'sharp';
import { sniffAcceptedImage } from './image-content-type';

const solid = (fmt: 'png' | 'webp'): Promise<Buffer> =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: '#abcdef' },
  })
    [fmt]()
    .toBuffer();

describe('sniffAcceptedImage', () => {
  it('accepts a real PNG by its decoded format', async () => {
    expect(await sniffAcceptedImage(await solid('png'))).toBe('image/png');
  });

  it('accepts a real WebP', async () => {
    expect(await sniffAcceptedImage(await solid('webp'))).toBe('image/webp');
  });

  it('rejects an SVG even though it is an image (script-capable)', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    expect(await sniffAcceptedImage(svg)).toBeNull();
  });

  it('rejects a non-image / renamed file by content, not extension', async () => {
    expect(await sniffAcceptedImage(Buffer.from('just some text'))).toBeNull();
  });
});
