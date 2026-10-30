/**
 * How products and categories get the two names they are addressed by: the
 * slug in a URL and the private `sourceId` a sync run matches on. Every check
 * is a pre-check; `runUnique` turns the race it cannot close into a 409.
 */

import { ConflictException } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { slugify } from '@b2b-catalog-platform/shared/core/catalog';
import * as schema from '../../db/schema';
import { attributeDefinitions, categories, products } from '../../db/schema';
import { isUniqueViolation } from '../../db/pg-errors';

type Db = NodePgDatabase<typeof schema>;

/** The tables addressed by slug and sync key. */
type IdentifiedTable = typeof products | typeof categories;

/** The tables addressed by slug; attribute definitions have no sync key. */
type SluggedTable = IdentifiedTable | typeof attributeDefinitions;

/** The refusal for a slug in use; each surface names its own code. */
type SlugRefusal = (slug: string) => Error;

const slugTaken: SlugRefusal = (slug) =>
  new ConflictException({
    code: 'slug-taken',
    message: `Slug '${slug}' is already in use`,
  });

const sourceIdTaken = (sourceId: string) =>
  new ConflictException({
    code: 'source-id-taken',
    message: `Source id '${sourceId}' is already in use`,
  });

/** A slug on create: the admin's if given (409 if taken), else the name
 * transliterated, or `stem`, with a numeric suffix until unique. */
export async function resolveNewSlug(
  db: Db,
  table: SluggedTable,
  provided: string | undefined,
  name: string,
  stem: string,
  taken: SlugRefusal = slugTaken,
): Promise<string> {
  if (provided) {
    if (await slugExists(db, table, provided)) throw taken(provided);
    return provided;
  }
  const base = slugify(name) || stem;
  let candidate = base;
  for (let i = 2; await slugExists(db, table, candidate); i++) {
    candidate = `${base}-${i}`;
  }
  return candidate;
}

/** A slug on update: the old one unless a new, free slug is given. */
export async function resolveSlugOverride(
  db: Db,
  table: SluggedTable,
  provided: string | undefined,
  current: string,
  taken: SlugRefusal = slugTaken,
): Promise<string> {
  if (!provided || provided === current) return current;
  if (await slugExists(db, table, provided)) throw taken(provided);
  return provided;
}

async function slugExists(
  db: Db,
  table: SluggedTable,
  slug: string,
): Promise<boolean> {
  const [row] = await db
    .select({ slug: table.slug })
    .from(table)
    .where(eq(table.slug, slug))
    .limit(1);
  return !!row;
}

/** A product made in the admin gets a key outside the source system's
 * namespace: every product is ordered and invoiced by one. */
export async function resolveNewProductSourceId(
  db: Db,
  provided: string | undefined,
): Promise<string> {
  if (!provided) return `manual:${randomUUID()}`;
  if (await sourceIdExists(db, products, provided)) {
    throw sourceIdTaken(provided);
  }
  return provided;
}

/** A category made without a key has none: null tells the ownership rules
 * nobody else writes it. */
export async function resolveNewCategorySourceId(
  db: Db,
  provided: string | null | undefined,
): Promise<string | null> {
  if (!provided) return null;
  if (await sourceIdExists(db, categories, provided)) {
    throw sourceIdTaken(provided);
  }
  return provided;
}

/** On update, an absent key means "leave it alone". */
export async function resolveProductSourceIdOverride(
  db: Db,
  provided: string | undefined,
  current: string,
): Promise<string> {
  if (!provided || provided === current) return current;
  if (await sourceIdExists(db, products, provided)) {
    throw sourceIdTaken(provided);
  }
  return provided;
}

/** The same, plus null, which detaches a category from the exchange. */
export async function resolveCategorySourceIdOverride(
  db: Db,
  provided: string | null | undefined,
  current: string | null,
): Promise<string | null> {
  if (provided === undefined || provided === current) return current;
  if (provided === null) return null;
  if (await sourceIdExists(db, categories, provided)) {
    throw sourceIdTaken(provided);
  }
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

/** A write whose unique violation, a race past the pre-checks, answers 409
 * rather than 500. */
export async function runUnique<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (isUniqueViolation(e)) {
      throw new ConflictException({
        code: 'slug-or-source-id-taken',
        message: 'A slug or source id conflict occurred',
      });
    }
    throw e;
  }
}
