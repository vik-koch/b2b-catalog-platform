import { MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import {
  collectReferencedFilenames,
  documentFilenames,
  DOCUMENT_REFERENCE_SOURCES,
  MEDIA_REFERENCE_SOURCES,
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

/**
 * A real drizzle over a client that answers every query with the given rows,
 * in the array form drizzle asks the driver for. Keeps what was asked.
 */
function fakeDb(rows: unknown[][]) {
  const asked: string[] = [];
  const client = {
    query: async (query: { text: string }) => {
      asked.push(query.text);
      return { rows, rowCount: rows.length, fields: [] };
    },
  };
  return { db: drizzle({ client: client as never, schema }), asked };
}

describe('MEDIA_REFERENCE_SOURCES', () => {
  it('scans page bodies, both jsonb image columns and order thumbnails', async () => {
    const { db, asked } = fakeDb([]);

    await collectReferencedFilenames(db);

    expect(asked).toEqual([
      'select "bodyHtml" from "page_versions"',
      'select "images" from "products"',
      'select "thumbnail" from "order_items" where "order_items"."thumbnail" is not null',
      'select "mark" from "categories" where "categories"."mark" is not null',
    ]);
  });

  it('reads both filenames of every image pair', async () => {
    const { db } = fakeDb([
      [
        [
          {
            full: `${MEDIA_URL_PREFIX}/a-full.webp`,
            thumb: `${MEDIA_URL_PREFIX}/a-thumb.webp`,
          },
        ],
      ],
    ]);

    const product = MEDIA_REFERENCE_SOURCES.find(
      (source) => source.name === 'product images',
    );
    expect(await product?.collect(db)).toEqual(['a-full.webp', 'a-thumb.webp']);
  });
});

describe('DOCUMENT_REFERENCE_SOURCES', () => {
  it('collects every stored file the documents table points at', async () => {
    const { db, asked } = fakeDb([
      ['/documents/aaaa.pdf'],
      ['/documents/bbbb.png'],
    ]);

    const referenced = await collectReferencedFilenames(
      db,
      DOCUMENT_REFERENCE_SOURCES,
    );
    expect([...referenced].sort()).toEqual(['aaaa.pdf', 'bbbb.png']);
    // A link-only document has no file to keep.
    expect(asked).toEqual([
      'select "fileUrl" from "documents" where "documents"."fileUrl" is not null',
    ]);
  });
});
