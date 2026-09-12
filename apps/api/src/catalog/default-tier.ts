import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { customerTiers } from '../db/schema';

/**
 * The price list guests are charged and a product must be priced in to be
 * published (FR-AUTH-05). Looked up rather than cached: it is one row found by
 * a partial unique index, it changes when an admin moves the badge, and an
 * invalidated cache of it would misprice the whole catalog.
 *
 * It throws rather than returning null. Exactly one row carries the badge —
 * the index forbids a second, the delete and badge-move refusals forbid
 * removing the last — so a deployment without one is a broken install, not a
 * state every read path should grow a branch for.
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
