import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { Page } from '@b2b-catalog-platform/shared';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { page } from '../db/schema';

@Injectable()
export class PageService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async getPage(slug: string): Promise<Page | undefined> {
    const rows = await this.db.select().from(page).where(eq(page.id, slug));
    return rows[0];
  }
}
