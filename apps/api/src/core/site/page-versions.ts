import { desc, eq } from 'drizzle-orm';
import { Page } from '@b2b-catalog-platform/shared/core/site';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../../db/schema';
import { pageVersions } from '../../db/schema';

export type PageVersionRow = typeof pageVersions.$inferSelect;

type Reader = Pick<NodePgDatabase<typeof schema>, 'select'>;

/**
 * A page is its slug's highest version. A function taking the db or a
 * transaction, so orders and consents read a text without a site module.
 */
export async function currentPageVersion(
  db: Reader,
  slug: string,
): Promise<PageVersionRow | undefined> {
  const [row] = await db
    .select()
    .from(pageVersions)
    .where(eq(pageVersions.slug, slug))
    .orderBy(desc(pageVersions.version))
    .limit(1);
  return row;
}

export function toPage(row: PageVersionRow): Page {
  return {
    version: row.version,
    title: row.title,
    bodyHtml: row.bodyHtml,
    consentLabel: row.consentLabel,
    updatedAt: row.createdAt.toISOString(),
  };
}
