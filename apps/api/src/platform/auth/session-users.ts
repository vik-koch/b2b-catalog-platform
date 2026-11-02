import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { users } from '../../db/schema';

/** The account row a session names. */
export type SessionUser = typeof users.$inferSelect;

/** The one lookup every session check makes: the row decides, not the token. */
@Injectable()
export class SessionUsers {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async find(id: string): Promise<SessionUser | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }
}
