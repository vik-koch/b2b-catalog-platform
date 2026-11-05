import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../db/database.module';
// eslint-disable-next-line boundaries/dependencies -- to turn around: exchange should look up a token
import { apiTokens } from '../../core/exchange/exchange-schema';
import { hashToken } from './api-token-value';
import { MachineClient } from './machine-client';
import { Database } from '../db/database';

/** The token lookup behind MachineTokenGuard, as Sessions is the session's. */
@Injectable()
export class MachineTokens {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * The client behind a live token, or null for an unknown or revoked one:
   * the caller is owed no difference. Stamps `lastUsedAt`, which a refused
   * request is not.
   */
  async authenticate(value: string): Promise<MachineClient | null> {
    const [row] = await this.db
      .select()
      .from(apiTokens)
      .where(eq(apiTokens.tokenHash, hashToken(value)))
      .limit(1);
    if (!row || row.revokedAt) return null;

    await this.db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id));
    return { id: row.id, name: row.name, scopes: row.scopes };
  }
}
