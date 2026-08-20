import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { and, eq, exists, inArray, SQL, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { productAttributes, products } from '../db/schema';

/**
 * "This product carries this attribute" — the predicate behind the inventory's
 * drill-down (FR-ATTR-09) and the storefront's facets (FR-ATTR-05).
 *
 * An `exists` subquery rather than a join: a product carrying the key twice
 * would otherwise appear twice in the grid and twice in every count. Attribute
 * text is matched exactly, as everywhere else.
 *
 * Several values match any of them (FR-ATTR-05) — the OR within one attribute.
 * An empty list means the key alone; on its own a value means nothing and is
 * ignored, since a value only has meaning under its key.
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

/** The single-value form the admin product filter asks its question in. */
export function attributeFilterCondition(
  db: NodePgDatabase<typeof schema>,
  key: string | undefined,
  value: string | undefined,
): SQL | undefined {
  return attributeValuesCondition(db, key, value ? [value] : []);
}
