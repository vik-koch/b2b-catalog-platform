import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Page } from '@b2b-catalog-platform/shared/core/site';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { currentPageVersion, toPage } from '../../core/site/page-versions';

@Injectable()
export class PageService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  /** The page is its latest version. */
  async getPage(slug: string): Promise<Page | undefined> {
    const row = await currentPageVersion(this.db, slug);
    return row && toPage(row);
  }
}
