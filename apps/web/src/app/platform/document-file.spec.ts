import { documentFileCaption, documentFileSize } from './document-file';

const sizes = { kb: '{size} kB', mb: '{size} MB' };

describe('documentFileSize', () => {
  it('says kB below a megabyte and MB above it', () => {
    expect(documentFileSize(240 * 1024, sizes)).toBe('240 kB');
    expect(documentFileSize(3.25 * 1024 * 1024, sizes)).toBe('3.3 MB');
  });

  it('never says a file weighs nothing', () => {
    expect(documentFileSize(10, sizes)).toBe('1 kB');
  });
});

describe('documentFileCaption', () => {
  it('names the format and the size', () => {
    expect(
      documentFileCaption(
        { contentType: 'application/pdf', byteSize: 240 * 1024 },
        sizes,
      ),
    ).toBe('PDF · 240 kB');
  });
});
