import { drizzle } from 'drizzle-orm/node-postgres';
import { products } from './catalog-schema';
import { counterpartOf, pairedCountOf } from './product-pairings';

/** The count's shape: which rows and what it correlates on. Its figure needs
 * a real Postgres (api-e2e). */
describe('pairedCountOf', () => {
  /** Rendered as part of a query, never on its own: drizzle qualifies every
   * column when an expression is rendered standalone and emits bare names when
   * it is embedded, and only the embedded form can show the correlation
   * binding to the wrong table. */
  const rendered = (): string => {
    const db = drizzle({ client: {} as never });
    return db.select({ pairedCount: pairedCountOf() }).from(products).toSQL()
      .sql;
  };

  it('correlates on the outer product from both ends of the edge', () => {
    const text = rendered();

    // Qualified, or `"id"` binds inside the subquery and counts every edge
    // for every row.
    expect(text).toContain('"edge"."productAId" = "products"."id"');
    expect(text).toContain('"edge"."productBId" = "products"."id"');
  });

  it('counts only counterparts a customer could add', () => {
    const text = rendered();

    expect(text).toContain('"counterpart"."deletedAt" is null');
    expect(text).toContain('"counterpart"."publishedAt" is not null');
  });

  it('leaves the outer product out of its own count', () => {
    // The join picks the *other* end, so a row can never count itself: there is
    // no edge from a product to itself to pick up (the table's check
    // constraint refuses one).
    expect(rendered()).toContain('"counterpart"."id" = case');
  });
});

describe('counterpartOf', () => {
  it('binds the product id as a parameter rather than inlining it', () => {
    const db = drizzle({ client: {} as never });
    const { sql: text, params } = db
      .select({ other: counterpartOf("'; drop table users--") })
      .from(products)
      .toSQL();

    expect(params).toEqual(["'; drop table users--"]);
    expect(text).not.toContain('drop table');
  });
});
