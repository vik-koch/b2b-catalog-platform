import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ApiTokenScope } from '@b2b-catalog-platform/shared/core/exchange';

import { hashToken } from '../../platform/auth/api-token-value';
import { MachineClient } from '../../platform/auth/machine-client';
import { MachineTokens } from '../../platform/auth/machine-tokens';
import { Database } from '../../platform/db/database';
import { DRIZZLE } from '../../platform/db/database.module';
import { apiTokens } from './exchange-schema';

/** A machine client with the exchange's scopes, as this lookup made it. */
export type ExchangeMachine = MachineClient<ApiTokenScope>;

@Injectable()
export class ApiTokenLookup implements MachineTokens {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Stamps `lastUsedAt`, which a refused request is not. */
  async authenticate(value: string): Promise<ExchangeMachine | null> {
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
