import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, not, SQL, sql } from 'drizzle-orm';
import * as schema from '../../../../db/schema';
import { customerTiers, productPrices, products } from '../../../../db/schema';

/**
 * "This tier has a price of its own for this product": where the tier list's
 * count leads (FR-AUTH-05). A product falling back to the default list is not
 * matched: the filter answers "agreed with", not "charged to". `'no'` asks for
 * the gap instead.
 */
export function tierPriceCondition(
  db: NodePgDatabase<typeof schema>,
  tierId: string | typeof customerTiers.id | undefined,
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
