import { drizzle } from 'drizzle-orm/node-postgres';

import { MEDIA_URL_PREFIX } from '@b2b-catalog-platform/shared/platform';

import { collectReferencedFilenames } from '../platform/media/prune/media-references';
import { MEDIA_REFERENCES } from './app.media-references';

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
  return { db: drizzle({ client: client as never }), asked };
}

describe('MEDIA_REFERENCES.media', () => {
  it('scans page bodies, both jsonb image columns and order thumbnails', async () => {
    const { db, asked } = fakeDb([]);

    await collectReferencedFilenames(db, MEDIA_REFERENCES.media);

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

    const product = MEDIA_REFERENCES.media.find(
      (source) => source.name === 'product images',
    );
    expect(await product?.collect(db)).toEqual(['a-full.webp', 'a-thumb.webp']);
  });
});

describe('MEDIA_REFERENCES.documents', () => {
  it('collects every stored file the documents table points at', async () => {
    const { db, asked } = fakeDb([
      ['/documents/aaaa.pdf'],
      ['/documents/bbbb.png'],
    ]);

    const referenced = await collectReferencedFilenames(
      db,
      MEDIA_REFERENCES.documents,
    );
    expect([...referenced].sort()).toEqual(['aaaa.pdf', 'bbbb.png']);
    // A link-only document has no file to keep.
    expect(asked).toEqual([
      'select "fileUrl" from "documents" where "documents"."fileUrl" is not null',
    ]);
  });
});
