import { ConflictException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { slugify } from '@b2b-catalog-platform/shared';
import * as schema from '../db/schema';
import { categories, products } from '../db/schema';

/**
 * How a product and a category get the two names they are addressed by: the
 * slug the storefront puts in a URL, and the private `sourceId` a sync run
 * matches on. Both tables carry both, both are unique per table, and both are
 * resolved the same way — so the rules live here rather than once per writer.
 *
 * Every check is a pre-check. The columns are unique in the database too, and
 * `runUnique` is what turns the race the pre-check cannot close into a 409.
 */
type Db = NodePgDatabase<typeof schema>;

/** The two tables addressed by slug and sync key. */
type IdentifiedTable = typeof products | typeof categories;

const slugTaken = (slug: string) =>
  new ConflictException({
    code: 'slug-taken',
    message: `Slug '${slug}' is already in use`,
  });

const sourceIdTaken = (sourceId: string) =>
  new ConflictException({
    code: 'source-id-taken',
    message: `Source id '${sourceId}' is already in use`,
  });

/**
 * Resolve a slug on create: an admin-supplied slug is used as-is (409 if
 * taken), otherwise the name is transliterated and a numeric suffix appended
 * until unique. Falls back to `stem` when the name has no slug-able chars.
 */
export async function resolveNewSlug(
  db: Db,
  table: IdentifiedTable,
  provided: string | undefined,
  name: string,
  stem: string,
): Promise<string> {
  if (provided) {
    if (await slugExists(db, table, provided)) throw slugTaken(provided);
    return provided;
  }
  const base = slugify(name) || stem;
  let candidate = base;
  for (let i = 2; await slugExists(db, table, candidate); i++) {
    candidate = `${base}-${i}`;
  }
  return candidate;
}

/** Resolve a slug on update: keep the old one unless a new, free slug is given. */
export async function resolveSlugOverride(
  db: Db,
  table: IdentifiedTable,
  provided: string | undefined,
  current: string,
): Promise<string> {
  if (!provided || provided === current) return current;
  if (await slugExists(db, table, provided)) throw slugTaken(provided);
  return provided;
}

async function slugExists(
  db: Db,
  table: IdentifiedTable,
  slug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ slug: table.slug })
    .from(table)
    .where(eq(table.slug, slug))
    .limit(1);
  return !!row;
}

/**
 * A row created in the admin has no legacy id to carry, so it is given one that
 * cannot collide with the source system's namespace.
 */
export async function resolveNewSourceId(
  db: Db,
  table: IdentifiedTable,
  provided: string | undefined,
): Promise<string> {
  if (!provided) return `manual:${randomUUID()}`;
  if (await sourceIdExists(db, table, provided)) throw sourceIdTaken(provided);
  return provided;
}

export async function resolveSourceIdOverride(
  db: Db,
  table: IdentifiedTable,
  provided: string | undefined,
  current: string,
): Promise<string> {
  if (!provided || provided === current) return current;
  if (await sourceIdExists(db, table, provided)) throw sourceIdTaken(provided);
  return provided;
}

async function sourceIdExists(
  db: Db,
  table: IdentifiedTable,
  sourceId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ sourceId: table.sourceId })
    .from(table)
    .where(eq(table.sourceId, sourceId))
    .limit(1);
  return !!row;
}

/**
 * Run a write and translate a unique-violation (race with a concurrent admin,
 * past our pre-checks) into a 409 rather than a 500.
 */
export async function runUnique<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (
      typeof e === 'object' &&
      e !== null &&
      (e as { code?: string }).code === '23505'
    ) {
      throw new ConflictException({
        code: 'slug-or-source-id-taken',
        message: 'A slug or source id conflict occurred',
      });
    }
    throw e;
  }
}
