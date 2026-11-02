import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { passwordTokens } from '../../db/schema';

/** An invitation waits for someone to read their mail; a reset answers
 * someone at the form right now. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

/** The handle a write goes through: the pool, or a caller's transaction. */
type Writer = Pick<NodePgDatabase<typeof schema>, 'update'>;

/** Hex SHA-256, deterministic so the link can be looked up by itself. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class PasswordTokenService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Mint a link, answering the only readable copy of its token. Earlier
   * unused links for the account expire, so only the newest works. */
  async issue(userId: string, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    // One transaction, so two racing requests cannot leave two live links.
    await this.db.transaction(async (tx) => {
      await tx
        .update(passwordTokens)
        .set({ expiresAt: new Date(0) })
        .where(this.outstanding(userId));
      await tx.insert(passwordTokens).values({
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
      });
    });
    return token;
  }

  /** The account a link belongs to, or null for unknown, used or expired
   * alike, so a guessed token learns nothing. */
  async userIdFor(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: passwordTokens.userId })
      .from(passwordTokens)
      .where(this.usable(hashToken(token)));
    return row?.userId ?? null;
  }

  /** `userIdFor`'s check as the update's `where`, so of two simultaneous
   * clicks only one matches. */
  async redeem(token: string, db: Writer = this.db): Promise<string | null> {
    const [row] = await db
      .update(passwordTokens)
      .set({ usedAt: new Date() })
      .where(this.usable(hashToken(token)))
      .returning({ userId: passwordTokens.userId });
    return row?.userId ?? null;
  }

  /** An unused link left in an inbox is a way in for whoever reads it. */
  async revokeOutstanding(userId: string): Promise<void> {
    await this.db
      .update(passwordTokens)
      .set({ expiresAt: new Date(0) })
      .where(this.outstanding(userId));
  }

  /** Every unspent link of an account. */
  private outstanding(userId: string) {
    return and(
      eq(passwordTokens.userId, userId),
      isNull(passwordTokens.usedAt),
    );
  }

  /** The only state a link may be redeemed in. */
  private usable(tokenHash: string) {
    return and(
      eq(passwordTokens.tokenHash, tokenHash),
      isNull(passwordTokens.usedAt),
      gt(passwordTokens.expiresAt, new Date()),
    );
  }
}
