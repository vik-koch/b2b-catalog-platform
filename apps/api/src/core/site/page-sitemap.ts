import { Inject, Injectable } from '@nestjs/common';
import { asc, max } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/db/database.module';
import { Database } from '../../platform/db/database';
import { SitemapPages } from '../../platform/sitemap-pages';
import { pageVersions } from './site-schema';

@Injectable()
export class PageSitemap implements SitemapPages {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  list(): Promise<{ slug: string; updatedAt: Date }[]> {
    return this.db
      .select({
        slug: pageVersions.slug,
        updatedAt: max(pageVersions.createdAt).mapWith(pageVersions.createdAt),
      })
      .from(pageVersions)
      .groupBy(pageVersions.slug)
      .orderBy(asc(pageVersions.slug));
  }
}
