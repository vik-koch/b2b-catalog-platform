import { SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { customerTiers, productPrices, products } from '../db/schema';
import { qualified } from '../db/sql-columns';

/**
 * Tier price resolution (FR-AUTH-05). One definition shared by every read that
 * shows a price — listings, search and the product page — so a customer cannot
 * see one price in the grid and another on the detail page.
 *
 * Every price is a `product_prices` row, the default list's included, so the
 * two cases differ only in how many lists are consulted:
 *
 * - **No tier** (guests, crawlers, staff, and customers on the default list) —
 *   the badged tier's row.
 * - **A tier** — its own row if it has one, otherwise the badged tier's. A tier
 *   carries only its exceptions, so the fallback is the normal case, not an
 *   error path.
 *
 * **The result is nullable**: a product the source system has not priced has no
 * row in any list. Such a product cannot be published, so no storefront read
 * can meet one; the admin surfaces can, and say so.
 *
 * Correlated subqueries rather than joins: they drop into an existing `select`,
 * `where` or `order by` without restructuring the query around them, and they
 * read through the `product_prices` primary key. The cost is that ordering by
 * price makes the database resolve every matching row's price before it can
 * sort — fine at this catalog's size, and the thing to measure first if a
 * listing ever feels slow.
 */
export function resolvedPriceMinor(tierId: string | null): SQL<number | null> {
  if (!tierId) return sql<number | null>`${defaultPrice()}`;

  const tp = (column: PgColumn) => qualified(column, 'tp');
  return sql<
    number | null
  >`coalesce((select ${tp(productPrices.priceMinor)} from ${productPrices} "tp" where ${tp(productPrices.productId)} = ${qualified(products.id)} and ${tp(productPrices.tierId)} = ${tierId}), ${defaultPrice()})`;
}

/**
 * The badged list's price for the product in scope. Aliased by hand: inside an
 * `sql` template drizzle emits bare column names, and in a subquery's scope
 * `"id"` would resolve to whatever column happens to exist — today the outer
 * product, but an `id` on product_prices would silently capture it and re-price
 * the catalog.
 */
function defaultPrice(): SQL<number | null> {
  const dp = (column: PgColumn) => qualified(column, 'dp');
  const dt = (column: PgColumn) => qualified(column, 'dt');
  return sql<
    number | null
  >`(select ${dp(productPrices.priceMinor)} from ${productPrices} "dp" join ${customerTiers} "dt" on ${dt(customerTiers.id)} = ${dp(productPrices.tierId)} where ${dp(productPrices.productId)} = ${qualified(products.id)} and ${dt(customerTiers.isDefault)})`;
}

/**
 * The same expression for reads already narrowed to the visible catalog. A
 * product is publishable only once the default list prices it (FR-ADM-06), so
 * on this path the null is unreachable and the callers — listings, the product
 * page, the cart — keep a plain number.
 *
 * The cast is the only place that claim is made. Anything that can see an
 * unpublished product uses `resolvedPriceMinor` and handles the null.
 */
export function livePriceMinor(tierId: string | null): SQL<number> {
  return resolvedPriceMinor(tierId) as SQL<number>;
}
