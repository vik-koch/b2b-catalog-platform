import { SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { customerTiers, productPrices, products } from '../../db/schema';
import { qualified } from '../../db/sql-columns';

/**
 * A product's price for a tier (FR-AUTH-05), one definition for every read so
 * a grid and a page cannot disagree. Without a tier, the badged list's row;
 * with one, its own row if any, else the badged list's: a tier carries only
 * its exceptions. Null for a product no list prices, which only admin reads
 * can meet.
 *
 * A correlated subquery, so it drops into any select, where or order by. The
 * cost: sorting by price resolves every matching row first, the thing to
 * measure if a listing ever feels slow.
 */
export function resolvedPriceMinor(tierId: string | null): SQL<number | null> {
  if (!tierId) return sql<number | null>`${defaultPrice()}`;

  const tp = (column: PgColumn) => qualified(column, 'tp');
  return sql<
    number | null
  >`coalesce((select ${tp(productPrices.priceMinor)} from ${productPrices} "tp" where ${tp(productPrices.productId)} = ${qualified(products.id)} and ${tp(productPrices.tierId)} = ${tierId}), ${defaultPrice()})`;
}

/**
 * The badged list's price for the product in scope. Aliased by hand: drizzle
 * emits bare column names in an `sql` template, and an `id` on product_prices
 * would silently capture the outer product's and re-price the catalog.
 */
function defaultPrice(): SQL<number | null> {
  const dp = (column: PgColumn) => qualified(column, 'dp');
  const dt = (column: PgColumn) => qualified(column, 'dt');
  return sql<
    number | null
  >`(select ${dp(productPrices.priceMinor)} from ${productPrices} "dp" join ${customerTiers} "dt" on ${dt(customerTiers.id)} = ${dp(productPrices.tierId)} where ${dp(productPrices.productId)} = ${qualified(products.id)} and ${dt(customerTiers.isDefault)})`;
}

/**
 * The same, for reads narrowed to the visible catalog: publishing requires a
 * default price (FR-ADM-06), so the null cannot occur. This cast is the one
 * place that claim is made; anything that can see an unpublished product uses
 * `resolvedPriceMinor`.
 */
export function livePriceMinor(tierId: string | null): SQL<number> {
  return resolvedPriceMinor(tierId) as SQL<number>;
}
