import {
  ApiToken,
  ApiTokenInput,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared/admin/exchange';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../../platform/db/database.module';
import * as schema from '../../platform/db/schema';
import { apiTokens } from '../../platform/db/schema';
import { Actor } from '../../core/exchange/sync-run';
import { generateToken } from '../../platform/auth/api-token-value';

const notFound = () =>
  new NotFoundException({
    code: 'api-token-not-found',
    message: 'Token not found',
  });

type ApiTokenRow = typeof apiTokens.$inferSelect;

/** Never the hash, never the value. */
function toApiToken(row: ApiTokenRow): ApiToken {
  return {
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    prefix: row.prefix,
    createdAt: row.createdAt.toISOString(),
    createdBy: row.createdByEmail,
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

/** Issues, lists and revokes machine tokens (NFR-SEC-09). */
@Injectable()
export class ApiTokensService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  /** Newest first, revoked rows included: a retired token is part of the trail. */
  async listApiTokens(): Promise<ApiToken[]> {
    const rows = await this.db
      .select()
      .from(apiTokens)
      .orderBy(desc(apiTokens.createdAt));
    return rows.map(toApiToken);
  }

  /** The value is returned this once; only its hash is stored. */
  async createApiToken(
    input: ApiTokenInput,
    actor: Actor,
  ): Promise<CreatedApiToken> {
    const generated = generateToken();
    const [row] = await this.db
      .insert(apiTokens)
      .values({
        name: input.name,
        scopes: input.scopes,
        prefix: generated.prefix,
        tokenHash: generated.hash,
        createdBy: actor.id,
        createdByEmail: actor.email,
      })
      .returning();
    return { ...toApiToken(row), token: generated.value };
  }

  /** Revoking twice is not an error; the first revocation's time stands. */
  async revokeApiToken(id: string): Promise<ApiToken> {
    const [row] = await this.db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiTokens.id, id), isNull(apiTokens.revokedAt)))
      .returning();
    if (row) return toApiToken(row);

    const existing = await this.db.query.apiTokens.findFirst({
      where: eq(apiTokens.id, id),
    });
    if (!existing) throw notFound();
    return toApiToken(existing);
  }
}
