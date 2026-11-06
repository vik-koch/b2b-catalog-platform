import { drizzle } from 'drizzle-orm/node-postgres';
import { and } from 'drizzle-orm';
import { PRODUCT_FACTS } from '@b2b-catalog-platform/shared/admin/catalog';
import { products } from '../../../../core/catalog/catalog-schema';
import { contentCondition } from './content-filter';

const missingCondition = (
  db: Parameters<typeof contentCondition>[0],
  missing: Parameters<typeof contentCondition>[2],
) => contentCondition(db, [], missing);
const hasCondition = (
  db: Parameters<typeof contentCondition>[0],
  has: Parameters<typeof contentCondition>[1],
) => contentCondition(db, has, []);

/**
 * Rendered inside a real query, as the document filter's spec is: a fragment
 * rendered alone qualifies every column, and inside a query a bare name binds
 * to whichever table in scope owns one.
 */
const db = drizzle({ client: {} as never });

const render = (where: ReturnType<typeof and>) =>
  db.select({ slug: products.slug }).from(products).where(where).toSQL().sql;

describe('missingCondition', () => {
  it('is absent without a gap, so an unfiltered grid stays unfiltered', () => {
    expect(missingCondition(db, [])).toBeUndefined();
  });

  it('requires every entry, so two gaps narrow to products lacking both', () => {
    const text = render(missingCondition(db, ['picture', 'packaging']));
    expect(text).toContain('"images"');
    expect(text).toContain('not "products"."piecesPerPack" is not null');
    expect(text).toContain(' and ');
  });

  it('correlates the attribute gap on the product row', () => {
    const text = render(missingCondition(db, ['attributes']));
    expect(text).toContain('not exists');
    expect(text).toContain(
      '"product_attributes"."productId" = "products"."id"',
    );
  });
});

describe('the has form', () => {
  it('is absent with neither list, so an unfiltered grid stays unfiltered', () => {
    expect(contentCondition(db, [], [])).toBeUndefined();
  });

  it.each(PRODUCT_FACTS)('renders having %s, and lacking it', (fact) => {
    expect(() => render(hasCondition(db, [fact]))).not.toThrow();
    expect(() => render(missingCondition(db, [fact]))).not.toThrow();
  });

  it.each(PRODUCT_FACTS)('reads lacking %s as having it negated', (fact) => {
    expect(render(missingCondition(db, [fact]))).toMatch(/\bnot\b/);
  });

  it('requires both lists at once', () => {
    const text = render(contentCondition(db, ['featured'], ['documents']));
    expect(text).toContain('"featured"');
    expect(text).toContain('not exists');
    expect(text).toContain(' and ');
  });

  it('finds a pairing from either side of its canonical order', () => {
    const text = render(hasCondition(db, ['pairings']));
    expect(text).toContain('"product_pairings"."productAId" = "products"."id"');
    expect(text).toContain('"product_pairings"."productBId" = "products"."id"');
  });

  it('correlates documents on the product row rather than joining', () => {
    const text = render(hasCondition(db, ['documents']));
    expect(text).toContain('"document_products"."productId" = "products"."id"');
    expect(text).not.toContain('join');
  });
});
