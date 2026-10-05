import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { desc, eq, sql } from 'drizzle-orm';
import {
  AuthUser,
  Page,
  PageSlug,
  PageVersion,
  UpdatePageRequest,
} from '@b2b-catalog-platform/shared';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { pageVersions, users } from '../db/schema';

type VersionRow = typeof pageVersions.$inferSelect;

@Injectable()
export class PageService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  /** The page is its latest version. */
  async getPage(slug: string): Promise<Page | undefined> {
    const [row] = await this.db
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.slug, slug))
      .orderBy(desc(pageVersions.version))
      .limit(1);
    return row && toPage(row);
  }

  /**
   * Saves a new version. The body is sanitized here, on the only write path.
   * A save that changes nothing returns the current version instead, so every
   * version is a real change.
   */
  async updatePage(
    slug: PageSlug,
    update: UpdatePageRequest,
    editor: AuthUser,
  ): Promise<Page> {
    const content = {
      title: update.title,
      bodyHtml: sanitizeRichText(update.bodyHtml),
    };
    return this.db.transaction(async (tx) => {
      // Two saves of one page would otherwise both claim the same number.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${slug}))`);
      const [current] = await tx
        .select()
        .from(pageVersions)
        .where(eq(pageVersions.slug, slug))
        .orderBy(desc(pageVersions.version))
        .limit(1);
      if (
        current &&
        current.title === content.title &&
        current.bodyHtml === content.bodyHtml
      ) {
        return toPage(current);
      }
      const [row] = await tx
        .insert(pageVersions)
        .values({
          slug,
          version: (current?.version ?? 0) + 1,
          ...content,
          createdBy: editor.id,
          createdByEmail: editor.email,
        })
        .returning();
      return toPage(row);
    });
  }

  /** Newest first. */
  async listVersions(slug: PageSlug): Promise<PageVersion[]> {
    const rows = await this.db
      .select({ row: pageVersions, email: users.email })
      .from(pageVersions)
      .leftJoin(users, eq(users.id, pageVersions.createdBy))
      .where(eq(pageVersions.slug, slug))
      .orderBy(desc(pageVersions.version));
    return rows.map(({ row, email }) => ({
      ...toPage(row),
      editorEmail: email ?? row.createdByEmail,
    }));
  }
}

function toPage(row: VersionRow): Page {
  return {
    version: row.version,
    title: row.title,
    bodyHtml: row.bodyHtml,
    updatedAt: row.createdAt.toISOString(),
  };
}
