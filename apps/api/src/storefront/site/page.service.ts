import { Inject, Injectable } from '@nestjs/common';
import { Page } from '@b2b-catalog-platform/shared/core/site';
import { DRIZZLE } from '../../platform/db/database.module';
import { currentPageVersion, toPage } from '../../core/site/page-versions';
import { Database } from '../../platform/db/database';

@Injectable()
export class PageService {
  constructor(@Inject(DRIZZLE) private db: Database) {}

  async getPage(slug: string): Promise<Page | undefined> {
    const row = await currentPageVersion(this.db, slug);
    return row && toPage(row);
  }
}
