import {
  ApiToken,
  ApiTokenInput,
  CreatedApiToken,
} from '@b2b-catalog-platform/shared';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import { apiTokens } from '../db/schema';
import { generateToken, hashToken } from './api-token-value';
import { MachineClient } from './machine-client';

const notFound = () =>
  new NotFoundException({
    code: 'api-token-not-found',
    message: 'Token not found',
  });

type ApiTokenRow = typeof apiTokens.$inferSelect;

/** The row as the contract shows it — never the hash, never the value. */
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

/**
 * Issues, lists, revokes and — the part that matters on every machine request
 * — authenticates machine tokens (NFR-SEC-09).
 */
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

  /**
   * The only moment the value exists outside the caller's own storage. It is
   * hashed on the way into the row and returned once; there is no path that
   * reads it back, because there is nothing stored to read.
   */
  async createApiToken(
    input: ApiTokenInput,
    actor: { id: string; email: string },
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

  /**
   * Revoking twice is not an error — the operator's intent is already the
   * state, and the first revocation's timestamp is the true one, so it stands.
   */
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
