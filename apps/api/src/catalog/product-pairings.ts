import { and, eq, getTableName, inArray, or, SQL, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { PgColumn } from 'drizzle-orm/pg-core';
import { productPairings, products } from '../db/schema';

/**
 * Sold-together pairings as the storefront reads them (FR-SET-05). The admin
 * side owns writing them and lists every edge, marked; this side lists only
 * what a customer could add — a counterpart that is withdrawn or unpublished
 * is still an edge, and is still not a product on offer.
 *
 * An edge is stored once with the smaller id on the A side, so a product's
 * counterparts sit on whichever side it is not: the `case` picks the other end,
 * and the `or` is what makes the table read the same from both products.
 */

/** `"table"."column"` — an unambiguous reference inside a raw subquery. Inside
 * an `sql` template drizzle emits bare column names, so a correlated reference
 * left unqualified binds to whatever the subquery's own scope happens to
 * offer (see product-price.ts, which pays for the same thing). */
function qualified(column: PgColumn): SQL {
  return sql.raw(`"${getTableName(column.table)}"."${column.name}"`);
}

/**
 * How many sellable products the row being selected is paired with — a scalar
 * subquery that drops into any select over `products`.
 *
 * A count rather than the counterparts themselves, because this rides along on
 * every card in a listing: what a tile needs is whether to draw the marker, and
 * the list behind it is worth a request only for the tile that is pressed.
 */
export function pairedCountOf(): SQL<number> {
  const own = qualified(products.id);
  return sql<number>`(
    select count(*)::int
    from ${productPairings} as "edge"
    join ${products} as "counterpart"
      on "counterpart"."id" = case
        when "edge"."productAId" = ${own} then "edge"."productBId"
        else "edge"."productAId" end
    where ("edge"."productAId" = ${own} or "edge"."productBId" = ${own})
      and "counterpart"."deletedAt" is null
      and "counterpart"."publishedAt" is not null)`;
}

/** The other end of the edge, whichever side this product is on. Join
 * `products` on it to read a product's counterparts. */
export function counterpartOf(productId: string): SQL<string> {
  return sql<string>`case
    when ${productPairings.productAId} = ${productId}
    then ${productPairings.productBId}
    else ${productPairings.productAId} end`;
}

/** Either end of an edge is this product. */
export function involves(productId: string) {
  return or(
    eq(productPairings.productAId, productId),
    eq(productPairings.productBId, productId),
  );
}

/**
 * The edges *among* a given set of products — every pairing where both ends are
 * in the set, as `[a, b]` id pairs.
 *
 * All the cart's check needs: a counterpart nobody added covers nothing, so
 * loading the whole neighbourhood of every line would be a bigger question with
 * the same answer.
 */
export async function pairingsAmong(
  db: NodePgDatabase<typeof schema>,
  productIds: readonly string[],
): Promise<[string, string][]> {
  if (productIds.length < 2) return [];
  const ids = [...productIds];
  const rows = await db
    .select({
      a: productPairings.productAId,
      b: productPairings.productBId,
    })
    .from(productPairings)
    .where(
      and(
        inArray(productPairings.productAId, ids),
        inArray(productPairings.productBId, ids),
      ),
    );
  return rows.map((row) => [row.a, row.b]);
}
