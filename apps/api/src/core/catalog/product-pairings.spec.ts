import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { products } from '../db/schema';
import { counterpartOf, pairedCountOf } from './product-pairings';

/**
 * These assert the *shape* of the count — which rows it looks at and what it
 * correlates on. That it returns the right figure for real rows needs a real
 * Postgres and is covered in api-e2e.
 */
describe('pairedCountOf', () => {
  /** Rendered as part of a query, never on its own: drizzle qualifies every
   * column when an expression is rendered standalone and emits bare names when
   * it is embedded, and only the embedded form can show the correlation
   * binding to the wrong table. */
  const rendered = (): string => {
    const db = drizzle({ client: {} as never, schema });
    return db.select({ pairedCount: pairedCountOf() }).from(products).toSQL()
      .sql;
  };

  it('correlates on the outer product from both ends of the edge', () => {
    const text = rendered();

    // Table-qualified, or `"id"` would bind to whatever the subquery's own
    // scope offers — today the counterpart, which would count every edge in
    // the table for every row.
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
    const db = drizzle({ client: {} as never, schema });
    const { sql: text, params } = db
      .select({ other: counterpartOf("'; drop table users--") })
      .from(products)
      .toSQL();

    expect(params).toEqual(["'; drop table users--"]);
    expect(text).not.toContain('drop table');
  });
});
