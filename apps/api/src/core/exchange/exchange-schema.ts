import { sql } from 'drizzle-orm';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_PREFIX_LENGTH,
  API_TOKEN_SCOPES,
} from '@b2b-catalog-platform/shared/platform';
import {
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
import { users } from '../accounts/accounts-schema';

export const apiTokenScope = pgEnum('api_token_scope', API_TOKEN_SCOPES);

/**
 * A credential an automated client presents instead of a session (NFR-SEC-09).
 *
 * A row, not an account: no password, no email, no tier, no role, and no way
 * to sign in. Keeping it out of `users` is what lets the account rules stay
 * free of exceptions for a caller with no inbox, and keeps a permanent
 * credential out of the mechanism built to expire credentials.
 *
 * Only the SHA-256 of the value is stored, and the value is returned once by
 * the call that creates it. SHA-256 rather than argon2 for the same reason
 * `password_tokens` uses it: the secret is 256 bits of randomness, so it needs
 * no slow KDF, and a deterministic hash is what lets the presented credential
 * find its own row. `prefix` is the clear head of the same value, display only
 * — nothing resolves by it.
 */
export const apiTokens = pgTable(
  'api_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: API_TOKEN_NAME_MAX_LENGTH }).notNull(),
    // A set, because one automated client usually does several things and
    // splitting those across two credentials is the operator's problem, not
    // the platform's. Constrained non-empty: a token allowed nothing is a row
    // that can only confuse, and the guard would refuse it anyway.
    scopes: apiTokenScope('scopes').array().notNull(),
    prefix: varchar('prefix', { length: API_TOKEN_PREFIX_LENGTH }).notNull(),
    tokenHash: varchar('tokenHash', { length: 64 }).notNull().unique(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Kept both ways, like a sync run's actor: the FK for joins, the email so
    // the trail still names who issued it once the account is gone.
    createdBy: uuid('createdBy').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdByEmail: varchar('createdByEmail', { length: 255 }),
    // Written on every authenticated request. The only thing that makes a
    // token nobody has retired but nobody uses either visible.
    lastUsedAt: timestamp('lastUsedAt', { withTimezone: true }),
    // Set means refused from the next request on — no version counter to
    // propagate. The row stays: the runs it made point at it.
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
  // The source and the catalog already agree: terminal on arrival, because a
  // run with nothing in it is not a decision anybody has to make.
  'no-change',
  // Both mean staged and never applied, kept apart because they are different
  // sentences: a newer run replaced this one, or an admin said no to it.
  'superseded',
  'discarded',
]);

// An admin's upload, or a machine token's submission (FR-ADM-07).
export const syncRunSource = pgEnum('sync_run_source', ['upload', 'api']);

export const syncArea = pgEnum('sync_area', SYNC_AREAS);

// Why a run waited for a person instead of applying itself: its effect was
// outside the deployment's policy, or the caller asked to be doubted.
export const syncStagedReason = pgEnum('sync_staged_reason', [
  'policy',
  'requested',
]);

/**
 * One bulk-sync run (FR-ADM-02). This is both the audit log the requirement
 * asks for and the answer to "when did we last sync" — the newest applied row —
 * which is why there is no separate last-sync setting to keep consistent.
 *
 * `rows` stages the parsed import between preview and commit, so a commit needs
 * no re-upload and both halves diff the same input. It is cleared once the run
 * finishes, and pruned by age, so the table does not accumulate catalogs.
 */
export const syncRuns = pgTable('sync_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Insertion order, which is what "the run before this one" means. Not
  // `startedAt`: a wall clock can be stepped backwards, and a run stamped
  // after the step would sort below the one it followed.
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  status: syncRunStatus('status').notNull().default('previewed'),
  // Which area of the platform's data the run carries (ADR 0060). One table
  // rather than one per area: everything around a run — its lifecycle, why it
  // was staged, who ran it, what it is counted as — is the same whatever it
  // carries, and only `rows` and who may read it differ.
  //
  // Defaulted to the catalog, which is what every row written before this
  // column existed was, and what a caller that names no area still means.
  area: syncArea('area').notNull().default('catalog'),
  source: syncRunSource('source').notNull().default('upload'),
  filename: text('filename'),
  startedAt: timestamp('startedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp('finishedAt', { withTimezone: true }),
  // The actor is kept two ways on purpose: the FK for joins, and the email
  // denormalized so the audit trail still names who ran it after the account
  // is gone (accounts are deletable; the audit record is not rewritable).
  actorId: uuid('actorId').references(() => users.id, { onDelete: 'set null' }),
  actorEmail: varchar('actorEmail', { length: 255 }),
  // The credential behind a headless run, kept the same two ways and for the
  // same reason. A token is revoked rather than deleted, so the FK holds.
  tokenId: uuid('tokenId').references(() => apiTokens.id),
  tokenName: varchar('tokenName', { length: API_TOKEN_NAME_MAX_LENGTH }),
  stagedReason: syncStagedReason('stagedReason'),
  // Null on a run an automated client reported as broken before it produced
  // anything: no intent was ever stated and nothing was ever counted.
  // The three columns whose shape follows the run's `area` (ADR 0060). One
  // table rather than one per area, so they are typed as the union and read
  // through it — the service that acts on a run knows which area it is in
  // before it looks, since that is what decided which service it reached.
  options: jsonb('options').$type<CatalogSyncOptions | CustomerSyncOptions>(),
  summary: jsonb('summary').$type<SyncSummary>(),
  rows: jsonb('rows').$type<CatalogSyncRow[] | CustomerSyncRow[]>(),
  // What the run actually did, kept once it is applied — the staged `rows` are
  // dropped at that point, and counts alone do not answer "which products
  // moved last night", which is the question the log exists for. Capped by the
  // same preview limit, so a first import stores a readable diff rather than a
  // catalog.
  plan: jsonb('plan').$type<
    CatalogSyncPlan | CustomerSyncPlan | OrderSyncPlan
  >(),
  // Rows the file itself could not yield (bad price, missing/duplicate
  // sourceId). Staged with `rows` so a commit's re-diff reports the same error
  // count the preview showed — the parse happens once, at upload.
  parseErrors: jsonb('parseErrors').$type<
    CatalogSyncRowError[] | CustomerSyncRowError[]
  >(),
  error: text('error'),
  // What the sending system wanted said about a run that worked anyway. Kept
  // like `error` and never read by anything here: the platform does not know
  // the source format well enough to have an opinion about it.
  notice: text('notice'),
});
