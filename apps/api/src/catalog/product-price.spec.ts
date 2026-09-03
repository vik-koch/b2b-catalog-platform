import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PgDialect } from 'drizzle-orm/pg-core';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { resolvedPiecePrice, resolvedPriceMinor } from './product-price';
import { productOrderBy } from './product-sort';

/** Renders an expression the way the query builder would, with its params. */
function render(expression: unknown): { text: string; params: unknown[] } {
  const query = new PgDialect().sqlToQuery(sql`${expression}`);
  return { text: query.sql, params: query.params };
}

/**
 * These assert the *shape* of the resolution — which column is read, whether a
 * join happens, and that the tier id is bound rather than interpolated. That
 * the fallback picks the right number for real rows needs a real Postgres and
 * is covered in api-e2e.
 */
describe('resolvedPriceMinor', () => {
  it('reads the base column directly when there is no tier', () => {
    const { text, params } = render(resolvedPriceMinor(null));

    expect(text).toBe('"products"."defaultPriceMinor"');
    expect(params).toEqual([]);
  });

  it('falls back to the base column for a tier without a row', () => {
    const { text } = render(resolvedPriceMinor('tier-1'));

    expect(text).toContain('coalesce');
    expect(text).toContain('"product_prices"."priceMinor"');
    // The fallback arm is the base column, so a tier that prices nothing sees
    // exactly the default list.
    expect(text).toContain('"products"."defaultPriceMinor"');
  });

  it('binds the tier id as a parameter rather than inlining it', () => {
    const { text, params } = render(
      resolvedPriceMinor("'; drop table users--"),
    );

    expect(params).toEqual(["'; drop table users--"]);
    expect(text).not.toContain('drop table');
  });

  it('correlates on the product row instead of joining', () => {
    const { text } = render(resolvedPriceMinor('tier-1'));

    expect(text).toContain('"product_prices"."productId" = "products"."id"');
    expect(text).not.toContain('join');
  });

  it('keeps the correlation table-qualified inside a real query', () => {
    // Rendered on its own, drizzle qualifies every column; rendered as part of
    // a query it emits bare names, and a bare `"id"` in the subquery would bind
    // to whichever table in scope owns one. Only this form catches that.
    const db = drizzle({ client: {} as never, schema });
    const { sql: text } = db
      .select({ price: resolvedPriceMinor('tier-1') })
      .from(products)
      .toSQL();

    expect(text).toContain('"product_prices"."productId" = "products"."id"');
  });
});

describe('price sorting follows resolution', () => {
  /** Rendered without the availability lead every listing opens with
   * (FR-STOCK-05) — what is under test here is the price key it precedes. */
  const renderOrder = (clauses: ReturnType<typeof productOrderBy>) =>
    new PgDialect()
      .sqlToQuery(
        sql.join(
          clauses.map((clause) => sql`${clause}`),
          sql`, `,
        ),
      )
      .sql.replace(/^case[\s\S]*?end asc, /, '');

  it('sorts a tiered caller on the resolved price, not the base column', () => {
    const price = resolvedPriceMinor('tier-1');
    const ordered = renderOrder(productOrderBy('price', undefined, price));

    // Ordering on the bare column here would page the customer by prices they
    // are never shown.
    expect(ordered).toContain('coalesce');
    expect(ordered).toMatch(/^coalesce/);
  });

  it('divides a tiered price down too, so both resolutions compose', () => {
    // Dropping either step orders the page by prices nobody is charged.
    const ordered = renderOrder(
      productOrderBy('price', undefined, resolvedPiecePrice('tier-1')),
    );

    expect(ordered).toContain('coalesce');
    expect(ordered).toContain('"products"."priceBasisPieces"');
  });

  it('divides the untiered sort down to a price per piece', () => {
    // Costs the index on the bare column; accepted at this catalog's size.
    expect(renderOrder(productOrderBy('price'))).toMatch(
      /^\("products"\."defaultPriceMinor"\)::numeric \/ "products"\."priceBasisPieces" asc/,
    );
  });

  it('sorts descending on the resolved price too', () => {
    const price = resolvedPriceMinor('tier-1');
    const ordered = renderOrder(productOrderBy('price_desc', undefined, price));

    expect(ordered).toContain('coalesce');
    expect(ordered).toMatch(/\) desc/);
  });
});
