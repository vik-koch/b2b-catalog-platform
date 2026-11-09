import { sql } from 'drizzle-orm';
import { API_TOKEN_PREFIX_LENGTH } from '@b2b-catalog-platform/shared/platform';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_SCOPES,
  SYNC_AREAS,
  type CustomerSyncOptions,
  type CustomerSyncPlan,
  type OrderSyncPlan,
  type CustomerSyncRow,
  type CustomerSyncRowError,
  type CatalogSyncOptions,
  type CatalogSyncPlan,
  type CatalogSyncRow,
  type CatalogSyncRowError,
  type SyncSummary,
} from '@b2b-catalog-platform/shared/core/exchange';
import {
  bigint,
  check,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { identities } from '../../platform/db/schema';

export const apiTokenScope = pgEnum('api_token_scope', API_TOKEN_SCOPES);

/**
 * What an automated client presents instead of a session (NFR-SEC-09). Not
 * an account: no password, email, tier or role, so the account rules need no
 * exceptions for a caller without an inbox.
 *
 * Only the SHA-256 of the value is kept, and the value is shown once, at
 * creation. Not argon2, as with `password_tokens`: 256 random bits need no
 * slow hash, and a deterministic one finds its row. `prefix` is the value's
 * clear head, for display only.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: API_TOKEN_NAME_MAX_LENGTH }).notNull(),
    /** A set, as one client usually does several things. Never empty: a token
     * allowed nothing only confuses. */
    scopes: apiTokenScope('scopes').array().notNull(),
    prefix: varchar('prefix', { length: API_TOKEN_PREFIX_LENGTH }).notNull(),
    tokenHash: varchar('tokenHash', { length: 64 }).notNull().unique(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** With the email beside it, so the trail names who issued the token once
     * the account is gone. */
    createdBy: uuid('createdBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    createdByEmail: varchar('createdByEmail', { length: 255 }),
    /** Written on every authenticated request: what shows a token nobody
     * retired and nobody uses. */
    lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }),
    /** Refused from the next request on. The row stays: its runs point at
     * it. */
    revokedAt: timestamp('revokedAt', { withTimezone: true }),
  },
  (t) => [
    check(
      'api_tokens_scopes_not_empty',
      sql`array_length(${t.scopes}, 1) >= 1`,
    ),
  ],
);

export const syncRunStatus = pgEnum('sync_run_status', [
  'previewed',
  'applied',
  'failed',
  /** Source and shop already agree: final on arrival, as nobody has to
   * decide anything. */
  'no-change',
  /** Staged and never applied: a newer run replaced it, or an admin said no.
   * Apart because a reader is told different things. */
  'superseded',
  'discarded',
]);

/** An admin's upload, or a machine token's submission (FR-ADM-07). */
export const syncRunSource = pgEnum('sync_run_source', ['upload', 'api']);

export const syncArea = pgEnum('sync_area', SYNC_AREAS);

/** Why a run waited for a person: its effect was outside the shop's policy,
 * or the caller asked for a review. */
export const syncStagedReason = pgEnum('sync_staged_reason', [
  'policy',
  'requested',
]);

/**
 * One exchange run (FR-ADM-02): the audit log, and in its newest applied row
 * the answer to "when did we last sync", so no setting has to agree with it.
 *
 * `rows` stages the parsed input between preview and commit, so the commit
 * needs no upload and both halves diff the same input. Cleared when the run
 * ends, and pruned by age.
 */
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Insertion order, which is what "the run before" means: a wall clock can
   * step backwards, so `startedAt` cannot say it. */
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  status: syncRunStatus('status').notNull().default('previewed'),
  /** What the run carries. One table for every area, as a run's lifecycle,
   * actor and counting are the same; only `options`, `rows` and `plan` and
   * who may read them differ. A caller naming no area means the catalog. */
  area: syncArea('area').notNull().default('catalog'),
  source: syncRunSource('source').notNull().default('upload'),
  filename: text('filename'),
  startedAt: timestamp('startedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finishedAt', { withTimezone: true }),
  /** With the email beside it, so the trail names who ran it once the
   * account is gone. */
  actorId: uuid('actorId').references(() => identities.id, {
    onDelete: 'set null',
  }),
  actorEmail: varchar('actorEmail', { length: 255 }),
  /** The credential behind a headless run, with its name beside it. A token
   * is revoked, never deleted, so the key holds. */
  tokenId: uuid('tokenId').references(() => apiTokens.id),
  tokenName: varchar('tokenName', { length: API_TOKEN_NAME_MAX_LENGTH }),
  stagedReason: syncStagedReason('stagedReason'),
  /** Shaped by `area`, so typed as the union: the service acting on a run
   * already knows its area. All null on a run a client reported broken before
   * it produced anything. */
  options: jsonb('options').$type<CatalogSyncOptions | CustomerSyncOptions>(),
  summary: jsonb('summary').$type<SyncSummary>(),
  rows: jsonb('rows').$type<CatalogSyncRow[] | CustomerSyncRow[]>(),
  /** What an applied run did, as counts cannot say which products moved last
   * night. Capped by the preview limit, so a first import keeps a readable
   * diff and not a catalogue. */
  plan: jsonb('plan').$type<
    CatalogSyncPlan | CustomerSyncPlan | OrderSyncPlan
  >(),
  /** Rows the input could not yield (a bad price, a missing or repeated
   * `sourceId`). Staged with `rows`, as parsing happens once, so the commit
   * reports the preview's count. */
  parseErrors: jsonb('parseErrors').$type<
    CatalogSyncRowError[] | CustomerSyncRowError[]
  >(),
  error: text('error'),
  /** What the sender wanted said about a run that worked. Kept and never
   * read here: the shop knows no source format well enough to judge it. */
  notice: text('notice'),
});
