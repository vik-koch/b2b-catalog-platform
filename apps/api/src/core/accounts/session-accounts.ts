import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/db/database.module';
import { Database } from '../../platform/db/database';
import { SessionUser, SessionUsers } from '../../platform/auth/session-users';
import { users } from './accounts-schema';

@Injectable()
export class SessionAccounts implements SessionUsers {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Only an `active` account signs in: the others are waiting, were turned
   * away or erased themselves. */
  async find(id: string): Promise<SessionUser | undefined> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id));
    return row?.status === 'active' ? row : undefined;
  }
}
