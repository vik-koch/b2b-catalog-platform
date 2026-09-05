import { drizzle } from 'drizzle-orm/node-postgres';
import { and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { documentCondition } from './document-filter';

/**
 * Rendered inside a real query, not on its own: drizzle qualifies every column
 * when a fragment is rendered alone and emits bare names inside a query, where
 * a bare `"productId"` would bind to whichever table in scope owns one.
 */
const db = drizzle({ client: {} as never, schema });

const render = (documentId?: string) =>
  db
    .select({ slug: products.slug })
    .from(products)
    .where(and(documentCondition(db, documentId)))
    .toSQL();

const DOCUMENT = '22222222-2222-2222-2222-222222222222';

describe('documentCondition', () => {
  it('is absent without a document, so an unfiltered grid stays unfiltered', () => {
    expect(documentCondition(db, undefined)).toBeUndefined();
    expect(render(undefined).sql).not.toContain('document_products');
  });

  it('correlates on the product row rather than joining', () => {
    const { sql: text } = render(DOCUMENT);

    expect(text).toContain('"document_products"."productId" = "products"."id"');
    expect(text).toContain('"document_products"."documentId"');
    expect(text).toContain('exists');
    expect(text).not.toContain('join');
  });

  it('binds the id as a parameter rather than inlining it', () => {
    const { sql: text, params } = render(DOCUMENT);

    expect(params).toEqual([DOCUMENT]);
    expect(text).not.toContain(DOCUMENT);
  });
});
