import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';

import {
  PageVersion,
  UpdatePageRequest,
} from '@b2b-catalog-platform/shared/admin/site';
import { Page, PageSlug } from '@b2b-catalog-platform/shared/core/site';
import { sanitizeRichText } from '@b2b-catalog-platform/shared/node';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

import { currentPageVersion, toPage } from '../../core/site/page-versions';
import { pageVersions } from '../../core/site/site-schema';
import { ACTOR_EMAILS, ActorEmails } from '../../platform/actor-emails';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';

@Injectable()
export class PageEditorService {
  constructor(
    @Inject(DRIZZLE) private db: Database,
    @Inject(ACTOR_EMAILS) private readonly actors: ActorEmails,
  ) {}

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
      consentLabel: update.consentLabel ?? null,
    };
    return this.db.transaction(async (tx) => {
      // Two saves of one page would otherwise both claim the same number.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${slug}))`);
      const current = await currentPageVersion(tx, slug);
      if (
        current &&
        current.title === content.title &&
        current.bodyHtml === content.bodyHtml &&
        current.consentLabel === content.consentLabel
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
      .select()
      .from(pageVersions)
      .where(eq(pageVersions.slug, slug))
      .orderBy(desc(pageVersions.version));
    const emails = await this.actors.currentOf(
      rows.flatMap((row) => row.createdBy ?? []),
    );
    return rows.map((row) => ({
      ...toPage(row),
      editorEmail:
        (row.createdBy && emails.get(row.createdBy)) ?? row.createdByEmail,
    }));
  }
}
