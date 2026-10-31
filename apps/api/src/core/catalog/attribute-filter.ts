import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, inArray, SQL, sql } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { productAttributes, products } from '../../db/schema';

/**
 * "This product carries this attribute", behind the inventory's drill-down
 * (FR-ATTR-09) and the storefront's facets (FR-ATTR-05). An `exists` rather
 * than a join, or a product carrying the key twice would count twice. Several
 * values match any of them; none means the key alone, and no key means no
 * condition.
 */
export function attributeValuesCondition(
  db: NodePgDatabase<typeof schema>,
  key: string | undefined,
  values: string[],
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
          values.length > 0
            ? inArray(productAttributes.value, values)
            : undefined,
        ),
      ),
  );
}
