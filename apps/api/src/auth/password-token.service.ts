import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { passwordTokens } from '../db/schema';

/**
 * How long a link lives. An invitation waits for a person to read their mail
 * after a staff member approved them during business hours; a reset answers
 * someone sitting at the form right now, so it closes quickly.
 */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;

/** Hex SHA-256, deterministic so the link can be looked up by itself. */
const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

@Injectable()
export class PasswordTokenService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Mint a link for an account, returning the raw token — the only moment it
   * exists in readable form. Any earlier unused token for that account is
   * expired first: a re-sent invitation or a second reset request must not
   * leave the previous link working, or a link forwarded to the wrong person
   * stays a way in.
   */
  async issue(userId: string, ttlMs: number): Promise<string> {
    await this.revokeOutstanding(userId);

    const token = randomBytes(32).toString('base64url');
    await this.db.insert(passwordTokens).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  /**
   * The account a link belongs to, or null when the link is unknown, already
   * used or past its expiry — three cases the caller must not distinguish, so
   * that a guessed token learns nothing from the answer.
   */
  async userIdFor(token: string): Promise<string | null> {
    const [row] = await this.db
      .select({ userId: passwordTokens.userId })
      .from(passwordTokens)
      .where(this.usable(hashToken(token)));
    return row?.userId ?? null;
  }

  /**
   * Redeem it: the same conditional check as `userIdFor`, but as the `where` of
   * the update, so two simultaneous clicks cannot both succeed — the second
   * matches no row.
   */
  async redeem(token: string): Promise<string | null> {
    const [row] = await this.db
      .update(passwordTokens)
      .set({ usedAt: new Date() })
      .where(this.usable(hashToken(token)))
      .returning({ userId: passwordTokens.userId });
    return row?.userId ?? null;
  }

  /**
   * Called when a password changes by any route: whatever links were out are
   * no longer needed, and one sitting unused in an inbox is one an attacker
   * with mailbox access could still use.
   */
  async revokeOutstanding(userId: string): Promise<void> {
    await this.db
      .update(passwordTokens)
      .set({ expiresAt: new Date(0) })
      .where(
        and(eq(passwordTokens.userId, userId), isNull(passwordTokens.usedAt)),
      );
  }

  /** Unused and unexpired — the only state a link may be redeemed in. */
  private usable(tokenHash: string) {
    return and(
      eq(passwordTokens.tokenHash, tokenHash),
      isNull(passwordTokens.usedAt),
      gt(passwordTokens.expiresAt, new Date()),
    );
  }
}
