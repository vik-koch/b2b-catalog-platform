import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { adminProductSortSchema } from '@b2b-catalog-platform/shared/admin/catalog';
import { SEARCH_SORTS } from '@b2b-catalog-platform/shared/core/catalog';
import { productSortKeys } from '../../../../core/catalog/product-sort';
import { adminProductOrderBy } from './grid-sort';

/** Renders an order-by list the way the query builder would, as one string. */
function render(clauses: ReturnType<typeof adminProductOrderBy>): string {
  const { sql: text } = new PgDialect().sqlToQuery(
    sql.join(
      clauses.map((clause) => sql`${clause}`),
      sql`, `,
    ),
  );
  return text;
}

const score = sql<number>`relevance_placeholder`;

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
   * those are what an admin came to deal with. The shared keys still fall back
   * to name order, which is what the storefront's listings keep.
   */
  it('falls back to state order when relevance has nothing to score', () => {
    expect(render(adminProductOrderBy('relevance'))).toBe(
      render(adminProductOrderBy('state')),
    );
    expect(render(productSortKeys('relevance'))).toBe(
      render(productSortKeys('name')),
    );
  });

  /**
   * The keys agree; the lead does not. A manager narrowing the catalog is
   * answering a question about it rather than shopping in it, so the grid is
   * not to pin every empty shelf to the bottom of every page — it filters by
   * stock instead (FR-ADM-05).
   */
  it.each(SEARCH_SORTS)(
    'delegates %s to the shared keys, without the availability lead',
    (option) => {
      const admin = render(adminProductOrderBy(option, score));

      expect(admin).toBe(render(productSortKeys(option, score)));
      expect(admin).not.toContain('"availability"');
    },
  );
});
