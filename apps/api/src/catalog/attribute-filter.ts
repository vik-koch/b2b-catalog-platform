import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, SQL, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { productAttributes, products } from '../db/schema';

/**
 * "This product carries this attribute" — the predicate behind the inventory's
 * drill-down (FR-ATTR-09) and, later, the storefront facets.
 *
 * An `exists` subquery rather than a join: a product carrying the key twice
 * would otherwise appear twice in the grid and twice in every count. Attribute
 * text is matched exactly, as everywhere else.
 *
 * `value` narrows to one of the key's values; on its own it means nothing and
 * is ignored, since a value only has meaning under its key.
 */
export function attributeFilterCondition(
  db: NodePgDatabase<typeof schema>,
  key: string | undefined,
  value: string | undefined,
): SQL | undefined {
  if (!key) return undefined;

  return exists(
    db
      .select({ one: sql`1` })
      .from(productAttributes)
      .where(
        and(
          eq(productAttributes.productId, products.id),
          eq(productAttributes.key, key),
          value ? eq(productAttributes.value, value) : undefined,
        ),
      ),
  );
}
