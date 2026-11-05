import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/db/database.module';
import { Database } from '../../platform/db/database';
import { hashToken } from '../../platform/auth/api-token-value';
import { MachineClient } from '../../platform/auth/machine-client';
import { MachineTokens } from '../../platform/auth/machine-tokens';
import { apiTokens } from './exchange-schema';

@Injectable()
export class ApiTokenLookup implements MachineTokens {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Stamps `lastUsedAt`, which a refused request is not. */
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
