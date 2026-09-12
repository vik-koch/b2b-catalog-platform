import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, not, SQL, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { productPrices, products } from '../db/schema';

/**
 * "This product has a price of its own for this tier" — what the admin grid
 * filters on when the tier list's price count is followed (FR-AUTH-05).
 *
 * An `exists` subquery for the same reason the attribute filter uses one: a
 * join would be safe here (the price table's key is product+tier, so at most
 * one row matches) but the two filters read as one kind of question and are
 * written the same way. The tier-leading index on `product_prices` is what
 * makes it cheap.
 *
 * Absent from a product means it is charged the default list's price; that is
 * not a row here and is deliberately not matched. The filter answers "agreed
 * with", not "charged to".
 *
 * `priced: 'no'` asks the same question the other way round — the products a
 * list does *not* price. It is what the tier list's count leads to when the
 * count is read as a gap ("wholesale prices 98 of 100"), and, against the
 * default list, it is the set no product can be published from.
 */
export function tierPriceCondition(
  db: NodePgDatabase<typeof schema>,
  tierId: string | undefined,
  priced: 'yes' | 'no' = 'yes',
): SQL | undefined {
  if (!tierId) return undefined;

  const has = exists(
    db
      .select({ one: sql`1` })
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, products.id),
          eq(productPrices.tierId, tierId),
        ),
      ),
  );
  return priced === 'no' ? not(has) : has;
}
