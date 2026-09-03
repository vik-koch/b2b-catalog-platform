import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  adminProductSortSchema,
  productSortSchema,
  searchSortSchema,
} from '@b2b-catalog-platform/shared';
import { adminProductOrderBy, productOrderBy } from './product-sort';

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
 * The availability lead every storefront listing now opens with
 * (FR-STOCK-05). The chosen sort is applied *within* it, so the assertions
 * below read the keys that follow rather than the first one.
 */
const LEAD = /^case[\s\S]*?end asc, /;

/** What a storefront listing sorts by once the availability lead is taken off
 * — and proof that the lead is there at all. */
function within(clauses: ReturnType<typeof productOrderBy>): string {
  const text = render(clauses);
  expect(text).toMatch(LEAD);
  return text.replace(LEAD, '');
}

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

  // FR-STOCK-05: out of stock last, everything else — including a product
  // nobody is counting — ahead of it, whatever the chosen sort is.
  it.each(searchSortSchema.options)(
    'leads %s with the availability of the row',
    (option) => {
      const text = render(productOrderBy(option, score));

      expect(text).toMatch(/^case/);
      expect(text).toContain(`"products"."availability" = 'out' then 1`);
      expect(text).toMatch(/end asc, /);
    },
  );

  it('leads with the relevance score when asked for relevance', () => {
    expect(within(productOrderBy('relevance', score))).toMatch(
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
  ] as const)('sorts %s on %s %s', (option, column, direction) => {
    expect(within(productOrderBy(option))).toMatch(
      new RegExp(`^"products"\\."${column}" ${direction}`),
    );
  });

  it.each([
    ['price', 'asc'],
    ['price_desc', 'desc'],
  ] as const)(
    'sorts %s by the price per piece, not the stored one',
    (option, direction) => {
      // Ordering on the raw column would put a €50-per-100-pieces product above
      // a €10-per-piece one.
      expect(within(productOrderBy(option))).toMatch(
        new RegExp(
          `^\\("products"\\."defaultPriceMinor"\\)::numeric / "products"\\."priceBasisPieces" ${direction}`,
        ),
      );
    },
  );
});

describe('adminProductOrderBy', () => {
  it.each(adminProductSortSchema.options)(
    'ends %s with the id tiebreak, so no row can swap pages',
    (option) => {
      expect(render(adminProductOrderBy(option, score))).toMatch(/"id" asc$/);
    },
  );

  it.each([
    ['updated', 'asc'],
    ['updated_desc', 'desc'],
  ] as const)('sorts %s on updatedAt %s', (option, direction) => {
    expect(render(adminProductOrderBy(option))).toMatch(
      new RegExp(`^"products"\\."updatedAt" ${direction}`),
    );
  });

  it.each([
    ['state', 'asc'],
    ['state_desc', 'desc'],
  ] as const)('sorts %s on what the row needs, %s', (option, direction) => {
    const rendered = render(adminProductOrderBy(option));

    // Unpublished (0) before live (1) before deleted (2), so ascending is
    // "what still needs somebody" first.
    expect(rendered).toContain('"deletedAt" is not null then 2');
    expect(rendered).toContain('"publishedAt" is null then 0');
    expect(rendered).toMatch(new RegExp(`end ${direction}`));
  });

  /*
   * The admin grid opens with no sort and no query, and alphabetical is not
   * what that screen is for: a sync leaves its new products unpublished, and
   * those are what an admin came to deal with. The storefront's own fallback is
   * untouched — see the shared ordering above.
   */
  it('falls back to state order when relevance has nothing to score', () => {
    expect(render(adminProductOrderBy('relevance'))).toBe(
      render(adminProductOrderBy('state')),
    );
    expect(render(productOrderBy('relevance'))).toBe(
      render(productOrderBy('name')),
    );
  });

  /**
   * The keys agree; the lead does not. A manager narrowing the catalog is
   * answering a question about it rather than shopping in it, so the grid is
   * not to pin every empty shelf to the bottom of every page — it filters by
   * stock instead (FR-ADM-05).
   */
  it.each(searchSortSchema.options)(
    'delegates %s to the shared ordering, without the availability lead',
    (option) => {
      const admin = render(adminProductOrderBy(option, score));

      expect(admin).toBe(within(productOrderBy(option, score)));
      expect(admin).not.toContain('"availability"');
    },
  );
});
