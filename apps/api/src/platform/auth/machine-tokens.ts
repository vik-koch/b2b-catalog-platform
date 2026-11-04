import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { apiTokens } from '../db/schema';
import { hashToken } from './api-token-value';
import { MachineClient } from './machine-client';

/** The token lookup behind MachineTokenGuard, as Sessions is the session's. */
@Injectable()
export class MachineTokens {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * The client behind a live token, or null for an unknown or revoked one:
   * the caller is owed no difference. Stamps `lastUsedAt`, which a refused
   * request is not.
   */
  async authenticate(value: string): Promise<MachineClient | null> {
    const row = await this.db.query.apiTokens.findFirst({
      where: eq(apiTokens.tokenHash, hashToken(value)),
    });
    if (!row || row.revokedAt) return null;

    await this.db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id));
    return { id: row.id, name: row.name, scopes: row.scopes };
  }
}
