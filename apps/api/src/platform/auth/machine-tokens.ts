import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../db/database.module';
import * as schema from '../../db/schema';
import { apiTokens } from '../../db/schema';
import { hashToken } from './api-token-value';
import { MachineClient } from './machine-client';

/** The token lookup behind MachineTokenGuard, as Sessions is the session's. */
@Injectable()
export class MachineTokens {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /**
   * Resolves a presented value to the client behind it, or null. Whether the
   * capabilities cover the route is not decided here — the guard knows what
   * the route asked for, and this only says who is calling.
   *
   * A successful lookup stamps `lastUsedAt` before answering, so a token in
   * use always says so. A revoked one is not stamped: the field answers "is
   * this still working", and a refused request is not use.
   */
  async authenticate(value: string): Promise<{
    client: MachineClient;
    revoked: boolean;
  } | null> {
    const hash = hashToken(value);
    const row = await this.db.query.apiTokens.findFirst({
      where: eq(apiTokens.tokenHash, hash),
    });
    if (!row) return null;

    if (row.revokedAt) {
      return {
        client: { id: row.id, name: row.name, scopes: row.scopes },
        revoked: true,
      };
    }

    await this.db
      .update(apiTokens)
      .set({ lastUsedAt: new Date() })
      .where(eq(apiTokens.id, row.id));

    return {
      client: { id: row.id, name: row.name, scopes: row.scopes },
      revoked: false,
    };
  }
}
