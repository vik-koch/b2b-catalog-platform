import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  productSortSchema,
  searchSortSchema,
} from '@b2b-catalog-platform/shared/storefront/catalog';
import { catalogOrderBy, productOrderBy } from './listing-sort';
import { resolvedPriceMinor } from '../../core/catalog/product-price';

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
    'sorts %s on the piece price the caller resolved, nulls last',
    (option, direction) => {
      const ordered = within(productOrderBy(option));

      expect(ordered).toContain('"dt"."isDefault"');
      expect(ordered).toMatch(new RegExp(`${direction} nulls last`));
    },
  );
});

describe('catalogOrderBy', () => {
  const price = resolvedPriceMinor(null);

  it('groups by the category order first, availability and name within', () => {
    const text = render(catalogOrderBy('category', price, ['a', 'b']));

    expect(text).toMatch(
      /^array_position\(\$1::uuid\[\], "products"\."categoryId"\) asc, case/,
    );
    expect(text).toMatch(
      /end asc, "products"\."name" asc, "products"\."id" asc$/,
    );
  });

  it.each(productSortSchema.options)(
    'delegates %s to the shared ordering',
    (option) => {
      expect(render(catalogOrderBy(option, price, ['a']))).toBe(
        render(productOrderBy(option, undefined, price)),
      );
    },
  );
});
