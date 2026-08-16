import { getTableName, SQL, sql } from 'drizzle-orm';
import { PgColumn } from 'drizzle-orm/pg-core';
import { productPrices, products } from '../db/schema';

/**
 * Tier price resolution (FR-AUTH-05). One definition shared by every read that
 * shows a price — listings, search and the product page — so a customer cannot
 * see one price in the grid and another on the detail page.
 *
 * The two cases of ADR 0031:
 *
 * - **No tier** (guests, crawlers, staff, and customers on the base list) —
 *   the stored column, untouched. No join, and the price index still applies,
 *   which matters because this is almost all catalog traffic.
 * - **A tier** — its `product_prices` row if it has one, otherwise the same
 *   base column. A tier carries only its exceptions, so the fallback is the
 *   normal case, not an error path.
 *
 * The tiered form is a correlated subquery rather than a left join: it drops
 * into an existing `select`, `where` or `order by` without restructuring the
 * query around it, and it reads through the `product_prices` primary key. The
 * cost is that ordering by price makes the database resolve every matching
 * row's price before it can sort — fine at this catalog's size, and the thing
 * to measure first if a tiered listing ever feels slow.
 */
export function resolvedPriceMinor(
  tierId: string | null,
): SQL<number> | PgColumn {
  if (!tierId) return products.defaultPriceMinor;

  // Table-qualified by hand: inside an `sql` template drizzle emits bare
  // column names, and in the subquery's scope `"id"` would resolve to whatever
  // column happens to exist — today the outer product, but a future `id` on
  // product_prices would silently capture it and re-price the catalog.
  return sql<number>`coalesce((select ${productPrices.priceMinor} from ${productPrices} where ${qualified(productPrices.productId)} = ${qualified(products.id)} and ${qualified(productPrices.tierId)} = ${tierId}), ${products.defaultPriceMinor})`;
}

/**
 * The same price divided down to one piece — what listings must order by, since
 * a stored price covers `priceBasisPieces` pieces and raw prices are therefore
 * not comparable between products.
 *
 * A real division, not an integer one: this only ever orders, never produces a
 * price anyone is charged.
 */
export function resolvedPiecePrice(tierId: string | null): SQL<number> {
  const price = resolvedPriceMinor(tierId);
  return sql<number>`(${price})::numeric / ${products.priceBasisPieces}`;
}

/** `"table"."column"` — an unambiguous reference inside a raw subquery. */
function qualified(column: PgColumn): SQL {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}
