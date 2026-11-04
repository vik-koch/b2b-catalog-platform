import sharp from 'sharp';
import {
  documentExtension,
  sniffAcceptedDocument,
} from './document-content-type';

const png = (): Promise<Buffer> =>
  sharp({
    create: { width: 8, height: 8, channels: 3, background: '#6f4e37' },
  })
    .png()
    .toBuffer();

describe('sniffAcceptedDocument', () => {
  it('recognises a PDF by its signature', async () => {
    const pdf = Buffer.from('%PDF-1.7\n... a document ...\n%%EOF');
    await expect(sniffAcceptedDocument(pdf)).resolves.toBe('application/pdf');
  });

  it('recognises a scanned document handed over as an image', async () => {
    await expect(sniffAcceptedDocument(await png())).resolves.toBe('image/png');
  });

  it('rejects a file that only claims to be a PDF', async () => {
    const text = Buffer.from('This is a PDF, honestly. %PDF- is further down.');
    await expect(sniffAcceptedDocument(text)).resolves.toBeNull();
  });

  it('rejects an SVG, as the image upload does', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>',
    );
    await expect(sniffAcceptedDocument(svg)).resolves.toBeNull();
  });
});

describe('documentExtension', () => {
  it('names the stored file after the type it really is', () => {
    expect(documentExtension('application/pdf')).toBe('pdf');
    expect(documentExtension('image/jpeg')).toBe('jpg');
  });
});
