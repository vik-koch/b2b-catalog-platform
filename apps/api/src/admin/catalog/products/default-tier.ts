import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../../db/schema';
import { customerTiers } from '../../../db/schema';

/**
 * The badged price list (FR-AUTH-05). Looked up, not cached: a stale cache
 * after a badge move would misprice the catalog. Throws rather than returning
 * null: exactly one row carries the badge, so none is a broken install.
 */
export async function defaultTierId(
  db: NodePgDatabase<typeof schema>,
): Promise<string> {
  const [row] = await db
    .select({ id: customerTiers.id })
    .from(customerTiers)
    .where(eq(customerTiers.isDefault, true))
    .limit(1);
  if (!row) {
    throw new Error('no price list carries the default badge');
  }
  return row.id;
}
