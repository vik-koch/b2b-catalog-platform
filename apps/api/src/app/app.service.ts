import { Injectable, Inject } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { helloWorld } from '../db/schema';

@Injectable()
export class AppService {
  constructor(@Inject(DRIZZLE) private db: NodePgDatabase<typeof schema>) {}

  async getData(): Promise<{ message: string }> {
    const valueFromDb = await this.db.select().from(helloWorld);
    return valueFromDb[0];
  }
}
