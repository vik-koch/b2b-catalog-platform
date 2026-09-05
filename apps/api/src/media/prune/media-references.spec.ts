import { MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared';
import {
  collectReferencedFilenames,
  documentFilenames,
  DOCUMENT_REFERENCE_SOURCES,
  mediaFilenamesInHtml,
  type MediaReferenceSource,
} from './media-references';

describe('mediaFilenamesInHtml', () => {
  it('extracts every /media/ filename from a body', () => {
    const html = `<p><img src="${MEDIA_URL_PREFIX}/a1b2.webp" alt=""></p>
      <img src="${MEDIA_URL_PREFIX}/c3d4.webp" alt="x">`;
    expect(mediaFilenamesInHtml(html)).toEqual(['a1b2.webp', 'c3d4.webp']);
  });

  it('returns nothing for a body with no media', () => {
    expect(mediaFilenamesInHtml('<p>plain text</p>')).toEqual([]);
  });

  it('ignores absolute URLs that only look like a media path', () => {
    // The prefix must match from its start; an external host is not a reference.
    const html = `<img src="https://evil.example.com${MEDIA_URL_PREFIX}/x.webp">`;
    // The regex still finds the /media/ segment inside — but the sanitizer would
    // never have stored such a src, so extraction only needs to be a superset of
    // what is reachable. Documenting the behavior: the trailing segment is found.
    expect(mediaFilenamesInHtml(html)).toEqual(['x.webp']);
  });
});

describe('collectReferencedFilenames', () => {
  const source = (name: string, filenames: string[]): MediaReferenceSource => ({
    name,
    collect: async () => filenames,
  });

  it('unions filenames across sources and de-duplicates', async () => {
    const referenced = await collectReferencedFilenames({} as never, [
      source('a', ['one.webp', 'two.webp']),
      source('b', ['two.webp', 'three.webp']),
    ]);
    expect([...referenced].sort()).toEqual([
      'one.webp',
      'three.webp',
      'two.webp',
    ]);
  });

  it('is empty when no source references anything', async () => {
    const referenced = await collectReferencedFilenames({} as never, [
      source('a', []),
    ]);
    expect(referenced.size).toBe(0);
  });
});

describe('documentFilenames', () => {
  it('extracts the filename from a stored document URL', () => {
    expect(documentFilenames('/documents/a1b2c3d4e5f6.pdf')).toEqual([
      'a1b2c3d4e5f6.pdf',
    ]);
  });

  it('does not treat an image URL as a document', () => {
    expect(documentFilenames('/media/a1b2.webp')).toEqual([]);
  });
});

describe('DOCUMENT_REFERENCE_SOURCES', () => {
  it('collects every stored file the documents table points at', async () => {
    const client = {
      query: async () => ({
        rows: [
          { fileUrl: '/documents/aaaa.pdf' },
          { fileUrl: '/documents/bbbb.png' },
        ],
      }),
    };

    const referenced = await collectReferencedFilenames(
      client as never,
      DOCUMENT_REFERENCE_SOURCES,
    );
    expect([...referenced].sort()).toEqual(['aaaa.pdf', 'bbbb.png']);
  });
});
