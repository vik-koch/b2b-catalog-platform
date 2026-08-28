import { drizzle } from 'drizzle-orm/node-postgres';
import { and } from 'drizzle-orm';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { tierPriceCondition } from './tier-price-filter';

/**
 * Rendered inside a real query, not on its own: drizzle qualifies every column
 * when a fragment is rendered alone and emits bare names inside a query, where
 * a bare `"productId"` would bind to whichever table in scope owns one.
 */
const db = drizzle({ client: {} as never, schema });

const render = (tierId?: string) =>
  db
    .select({ slug: products.slug })
    .from(products)
    .where(and(tierPriceCondition(db, tierId)))
    .toSQL();

const TIER = '11111111-1111-1111-1111-111111111111';

describe('tierPriceCondition', () => {
  it('is absent without a tier, so an unfiltered grid stays unfiltered', () => {
    expect(tierPriceCondition(db, undefined)).toBeUndefined();
    expect(render(undefined).sql).not.toContain('product_prices');
  });

  it('correlates on the product row rather than joining', () => {
    const { sql: text } = render(TIER);

    expect(text).toContain('"product_prices"."productId" = "products"."id"');
    expect(text).toContain('"product_prices"."tierId"');
    expect(text).toContain('exists');
    expect(text).not.toContain('join');
  });

  it('binds the id as a parameter rather than inlining it', () => {
    const { sql: text, params } = render(TIER);

    expect(params).toEqual([TIER]);
    expect(text).not.toContain(TIER);
  });
});
