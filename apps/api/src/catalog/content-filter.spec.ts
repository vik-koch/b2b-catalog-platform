import { drizzle } from 'drizzle-orm/node-postgres';
import { and } from 'drizzle-orm';
import { PRODUCT_FEATURES, PRODUCT_GAPS } from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { featureCondition, missingCondition } from './content-filter';

/**
 * Rendered inside a real query, as the document filter's spec is: a fragment
 * rendered alone qualifies every column, and inside a query a bare name binds
 * to whichever table in scope owns one.
 */
const db = drizzle({ client: {} as never, schema });

const render = (where: ReturnType<typeof and>) =>
  db.select({ slug: products.slug }).from(products).where(where).toSQL().sql;

describe('missingCondition', () => {
  it('is absent without a gap, so an unfiltered grid stays unfiltered', () => {
    expect(missingCondition(db, [])).toBeUndefined();
  });

  it.each(PRODUCT_GAPS)('renders the %s gap', (gap) => {
    expect(() => render(missingCondition(db, [gap]))).not.toThrow();
  });

  it('requires every entry, so two gaps narrow to products lacking both', () => {
    const text = render(missingCondition(db, ['picture', 'packaging']));
    expect(text).toContain('"images"');
    expect(text).toContain('"piecesPerPack" is null');
    expect(text).toContain(' and ');
  });

  it('correlates the attribute gap on the product row', () => {
    const text = render(missingCondition(db, ['attributes']));
    expect(text).toContain('not exists');
    expect(text).toContain(
      '"product_attributes"."productId" = "products"."id"',
    );
  });

  it('reads incomplete as any of the three page gaps, never packaging', () => {
    const text = render(missingCondition(db, ['incomplete']));
    expect(text).toContain('"images"');
    expect(text).toContain('"descriptionHtml"');
    expect(text).toContain('"product_attributes"');
    expect(text).toContain(' or ');
    expect(text).not.toContain('"piecesPerPack"');
    expect(text).not.toContain('"boxVolume"');
  });
});

describe('featureCondition', () => {
  it('is absent without a feature', () => {
    expect(featureCondition(db, [])).toBeUndefined();
  });

  it.each(PRODUCT_FEATURES)('renders the %s feature', (feature) => {
    expect(() => render(featureCondition(db, [feature]))).not.toThrow();
  });

  it('finds a pairing from either side of its canonical order', () => {
    const text = render(featureCondition(db, ['pairings']));
    expect(text).toContain('"product_pairings"."productAId" = "products"."id"');
    expect(text).toContain('"product_pairings"."productBId" = "products"."id"');
  });

  it('correlates documents on the product row rather than joining', () => {
    const text = render(featureCondition(db, ['documents']));
    expect(text).toContain('"document_products"."productId" = "products"."id"');
    expect(text).not.toContain('join');
  });
});
