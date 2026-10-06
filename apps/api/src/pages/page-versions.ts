import { desc, eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from '../db/schema';
import { pageVersions } from '../db/schema';

export type PageVersionRow = typeof pageVersions.$inferSelect;

type Reader = Pick<NodePgDatabase<typeof schema>, 'select'>;

/**
 * A page is its latest version: the slug's highest number. A plain function
 * rather than a service method, so a module that only reads the current text
 * does not take on the page module's dependencies.
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
