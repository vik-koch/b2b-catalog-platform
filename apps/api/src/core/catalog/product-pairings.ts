/**
 * Reading sold-together pairings (FR-SET-01/05). An edge is stored once, the
 * smaller id on the A side, so a product's counterparts sit on whichever side
 * it is not.
 */

import { and, eq, inArray, or, SQL, sql } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { PgColumn } from 'drizzle-orm/pg-core';
import { productPairings, products } from '../../db/schema';
import { qualified } from '../../db/sql-columns';

/**
 * How many products a customer could add alongside the row being selected: a
 * withdrawn or unpublished counterpart is still an edge, but not on offer. A
 * scalar subquery for any select over `products`.
 */
export function pairedCountOf(): SQL<number> {
  const own = qualified(products.id);
  const edge = (column: PgColumn) => qualified(column, 'edge');
  const counterpart = (column: PgColumn) => qualified(column, 'counterpart');
  const a = edge(productPairings.productAId);
  const b = edge(productPairings.productBId);
  return sql<number>`(
    select count(*)::int
    from ${productPairings} as "edge"
    join ${products} as "counterpart"
      on ${counterpart(products.id)} = case
        when ${a} = ${own} then ${b}
        else ${a} end
    where (${a} = ${own} or ${b} = ${own})
      and ${counterpart(products.deletedAt)} is null
      and ${counterpart(products.publishedAt)} is not null)`;
}

/** The other end of the edge, whichever side this product is on. Join
 * `products` on it to read a product's counterparts. */
export function counterpartOf(productId: string): SQL<string> {
  return sql<string>`case
    when ${productPairings.productAId} = ${productId}
    then ${productPairings.productBId}
    else ${productPairings.productAId} end`;
}

/** Either end of an edge is this product: an id, or the row in scope. */
export function involves(productId: string | typeof products.id) {
  return or(
    eq(productPairings.productAId, productId),
    eq(productPairings.productBId, productId),
  );
}

/** The pairings with both ends in the set, as `[a, b]` id pairs: all the
 * cart's check needs, since a counterpart nobody added covers nothing. */
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
