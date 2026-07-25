import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import {
  Page,
  PAGE_SLUGS,
  PageSlug,
  UpdatePageRequest,
} from '@b2b-catalog-platform/shared';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { pages } from '../db/schema';

/** The columns the contract exposes — `updatedBy` is audit data, kept internal. */
const publicColumns = {
  title: pages.title,
  bodyHtml: pages.bodyHtml,
  updatedAt: pages.updatedAt,
} as const;

@Injectable()
export class PageService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async getPage(slug: string): Promise<Page | undefined> {
    const rows = await this.db
      .select(publicColumns)
      .from(pages)
      .where(eq(pages.id, slug));
    return rows[0] && toPage(rows[0]);
  }

  /**
   * Replaces a page's title and body. The body is sanitized here rather than in
   * the controller: this is the only write path, so nothing can reach the
   * column unsanitized regardless of which caller arrives later.
   *
   * Works as an upsert — if a page is edited for the first time, it simply
   * inserts it first time. An additional slug check is applied here.
   */
  async updatePage(
    slug: PageSlug,
    update: UpdatePageRequest,
    editorId: string,
  ): Promise<Page | undefined> {
    if (!PAGE_SLUGS.includes(slug)) {
      return undefined;
    }

    const page = {
      title: update.title,
      bodyHtml: sanitizeRichText(update.bodyHtml),
      updatedAt: new Date(),
      updatedBy: editorId,
    };
    const rows = await this.db
      .insert(pages)
      .values({ id: slug, ...page })
      .onConflictDoUpdate({
        target: pages.id,
        set: page,
      })
      .returning(publicColumns);
    return rows[0] && toPage(rows[0]);
  }
}

/** The contract carries `updatedAt` as an ISO string; the driver hands us a Date. */
function toPage(row: {
  title: string;
  bodyHtml: string;
  updatedAt: Date;
}): Page {
  return { ...row, updatedAt: row.updatedAt.toISOString() };
}
