import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  productSortSchema,
  searchSortSchema,
} from '@b2b-catalog-platform/shared';
import { productOrderBy } from './product-sort';

/** Renders an order-by list the way the query builder would, as one string. */
function render(clauses: ReturnType<typeof productOrderBy>): string {
  const { sql: text } = new PgDialect().sqlToQuery(
    sql.join(
      clauses.map((clause) => sql`${clause}`),
      sql`, `,
    ),
  );
  return text;
}

const score = sql<number>`relevance_placeholder`;

/**
 * What matters about the ordering is not the SQL text but two properties:
 * every sort ends in a total order, and each key sorts on the column and in
 * the direction it names. Whether the rows come out in the right *order* needs
 * real rows and a real Postgres, and is covered by the api-e2e fixtures.
 */
describe('productOrderBy', () => {
  it.each(searchSortSchema.options)(
    'ends %s with the id tiebreak, so no row can swap pages',
    (option) => {
      expect(render(productOrderBy(option, score))).toMatch(/"id" asc$/);
    },
  );

  it.each(productSortSchema.options)(
    'never scores when the caller has no query (%s)',
    (option) => {
      expect(render(productOrderBy(option))).not.toContain(
        'relevance_placeholder',
      );
    },
  );

  it('leads with the relevance score when asked for relevance', () => {
    expect(render(productOrderBy('relevance', score))).toMatch(
      /^relevance_placeholder desc/,
    );
  });

  it('falls back to name order when relevance has nothing to score', () => {
    // Reachable only if a caller without a query passes the key through; the
    // answer is the plain listing order rather than an error.
    expect(render(productOrderBy('relevance'))).toBe(
      render(productOrderBy('name')),
    );
  });

  it.each([
    ['name', 'name', 'asc'],
    ['name_desc', 'name', 'desc'],
    ['price', 'priceMinor', 'asc'],
    ['price_desc', 'priceMinor', 'desc'],
  ] as const)('sorts %s on %s %s', (option, column, direction) => {
    expect(render(productOrderBy(option))).toMatch(
      new RegExp(`^"products"\\."${column}" ${direction}`),
    );
  });
});
