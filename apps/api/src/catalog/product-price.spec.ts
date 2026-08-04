import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { resolvedPriceMinor } from './product-price';
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
});

describe('price sorting follows resolution', () => {
  const renderOrder = (clauses: ReturnType<typeof productOrderBy>) =>
    new PgDialect().sqlToQuery(
      sql.join(
        clauses.map((clause) => sql`${clause}`),
        sql`, `,
      ),
    ).sql;

  it('sorts a tiered caller on the resolved price, not the base column', () => {
    const price = resolvedPriceMinor('tier-1');
    const ordered = renderOrder(productOrderBy('price', undefined, price));

    // Ordering on the bare column here would page the customer by prices they
    // are never shown.
    expect(ordered).toContain('coalesce');
    expect(ordered).toMatch(/^coalesce/);
  });

  it('leaves the untiered sort on the indexed column', () => {
    expect(renderOrder(productOrderBy('price'))).toMatch(
      /^"products"\."defaultPriceMinor" asc/,
    );
  });

  it('sorts descending on the resolved price too', () => {
    const price = resolvedPriceMinor('tier-1');
    const ordered = renderOrder(productOrderBy('price_desc', undefined, price));

    expect(ordered).toContain('coalesce');
    expect(ordered).toMatch(/\) desc/);
  });
});
