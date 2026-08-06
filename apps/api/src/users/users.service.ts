import { Inject, Injectable } from '@nestjs/common';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { users } from '../db/schema';

export type UserRow = typeof users.$inferSelect;

@Injectable()
export class UsersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findById(id: string): Promise<UserRow | undefined> {
    const rows = await this.db.select().from(users).where(eq(users.id, id));
    return rows[0];
  }

  async findByEmail(email: string): Promise<UserRow | undefined> {
    // Logins are case-insensitive: emails are stored lowercased (see bootstrap)
    // and looked up the same way, so `Admin@x` and `admin@x` are one account.
    const rows = await this.db
      .select()
      .from(users)
      .where(eq(users.email, email.trim().toLowerCase()));
    return rows[0];
  }

  /**
   * Create a self-registered account (FR-AUTH-01): `pending`, so it cannot sign
   * in, with no tier — staff assign one when they approve it. The hash is an
   * argon2 hash of a random secret nobody holds, rather than a placeholder.
   */
  async createPending(email: string, passwordHash: string): Promise<UserRow> {
    const [created] = await this.db
      .insert(users)
      .values({
        email: email.trim().toLowerCase(),
        passwordHash,
        role: 'user',
        status: 'pending',
      })
      .returning();
    return created;
  }

  /**
   * Replace the password hash and bump `tokenVersion` in one statement, so the
   * change atomically invalidates every session issued before it. Clears
   * `mustChangePassword` in the same write: whatever was handed to the account,
   * it has now chosen its own. Returns the updated row so the caller can
   * re-issue its own session token at the new version.
   */
  async setPassword(id: string, passwordHash: string): Promise<UserRow> {
    const [updated] = await this.db
      .update(users)
      .set({
        passwordHash,
        tokenVersion: sql`${users.tokenVersion} + 1`,
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }
}
