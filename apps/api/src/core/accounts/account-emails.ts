import { Inject, Injectable } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/db/database.module';
import { Database } from '../../platform/db/database';
import { ActorEmails } from '../../platform/actor-emails';
import { users } from './accounts-schema';

@Injectable()
export class AccountEmails implements ActorEmails {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async currentOf(ids: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, unique));
    return new Map(rows.map((row) => [row.id, row.email]));
  }
}
