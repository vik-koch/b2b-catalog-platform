import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module';
// eslint-disable-next-line boundaries/dependencies -- to turn around: accounts should look up the session's user
import { users } from '../../core/accounts/accounts-schema';
import { Database } from '../db/database';

/** The account row a session names. */
export type SessionUser = typeof users.$inferSelect;

/** The row a session check reads. */
@Injectable()
export class SessionUsers {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async find(id: string): Promise<SessionUser | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }
}
