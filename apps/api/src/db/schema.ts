import { sql } from 'drizzle-orm';
import type {
  SyncOptions,
  SyncRow,
  SyncRowError,
  SyncSummary,
} from '@b2b-catalog-platform/shared';
import {
  AnyPgColumn,
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const pages = pgTable('pages', {
  // The primary key IS the public slug (fixed set, see shared PAGE_SLUGS).
  id: varchar('id', { length: 64 }).primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  // Always sanitized: nothing writes here without passing through
  // sanitizeRichText — neither the admin endpoint nor the seed.
  bodyHtml: text('bodyHtml').notNull(),
  // No `createdAt`: rows are seeded, never created, so it would only record the
  // seed date. `updatedAt` is shown publicly as the page's last-changed date.
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Who last edited, for audit. Null for never-edited seeded content. No
  // version history is kept — this is the whole audit trail.
  updatedBy: uuid('updatedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
});

/**
 * Catalog categories, an adjacency-list tree. Structure (name, hierarchy) is
 * file-owned — derived from the import's category paths and keyed by
 * `sourceId` — while `sortOrder`, `image` and `description` are admin overlay
 * that survives a re-sync. `slug` is the public URL handle, generated once and
 * kept stable.
 */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The sync identity, derived from the file's category path. Unique + private.
  sourceId: varchar('sourceId', { length: 512 }).notNull().unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  parentId: uuid('parentId').references((): AnyPgColumn => categories.id, {
    onDelete: 'set null',
  }),
  // Overlay fields — admin-owned, never touched by the import. `image` is a
  // full + thumb media-store pair (thumb for the overview tiles); its URLs
  // must be covered by the media-prune reference scan.
  sortOrder: integer('sortOrder').notNull().default(0),
  image: jsonb('image').$type<ProductImageRef>(),
  description: text('description'),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Who last edited the admin overlay, for audit — the same trail `pages` and
  // `app_settings` keep. Null for rows only ever written by the sync.
  updatedBy: uuid('updatedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
});

/** A product's freetext characteristics — plain key/value, detail page only. */
export type ProductAttribute = { key: string; value: string };

/**
 * One gallery image, stored as two media-store URLs: `thumb` for the grid/list
 * (and search) so those views load little, `full` for the product page. No alt
 * is kept — the UI uses the product name. Order is the array order.
 */
export type ProductImageRef = { full: string; thumb: string };

/**
 * Catalog products. `sourceId` (the legacy system's private id) is the sync
 * upsert key and is never serialized to the API. `name`, `priceMinor` and
 * `categoryId` are file-owned; `descriptionHtml`, `attributes` and the images
 * (see product_images) are admin overlay that a re-sync leaves untouched.
 * Missing-from-source rows are soft-deleted via `deletedAt`, never removed.
 */
export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceId: varchar('sourceId', { length: 255 }).notNull().unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 512 }).notNull(),
  priceMinor: integer('priceMinor').notNull(),
  categoryId: uuid('categoryId')
    .notNull()
    .references(() => categories.id, { onDelete: 'restrict' }),
  // Overlay fields.
  descriptionHtml: text('descriptionHtml').notNull().default(''),
  attributes: jsonb('attributes')
    .$type<ProductAttribute[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  // Ordered gallery, each with a full and a thumb media-store URL. The
  // media-prune reference scan must include these URLs (and categories.image)
  // so seeded/uploaded images are not swept.
  images: jsonb('images')
    .$type<ProductImageRef[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  deletedAt: timestamp('deletedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Audit, matching `pages`/`app_settings`. `deletedBy` is separate from
  // `updatedBy` because removal is the one action worth attributing on its own:
  // deletion is soft, so "who hid this product" stays answerable after the fact.
  updatedBy: uuid('updatedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
  deletedBy: uuid('deletedBy').references(() => users.id, {
    onDelete: 'set null',
  }),
});

// New signups default to `user`; `admin`/`manager` are assigned deliberately.
export const userRole = pgEnum('user_role', ['admin', 'manager', 'user']);

// Plural table name (the singular `user` is a Postgres reserved word, awkward in
// the raw-SQL seed/bootstrap statements). Email is the login identifier.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: userRole('role').notNull().default('user'),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  // Incremented on password change. The signed session token embeds the value
  // it was issued with; the auth guard rejects a token whose version no longer
  // matches.
  tokenVersion: integer('tokenVersion').notNull().default(0),
  // True while the account still carries a password it did not choose itself:
  // the bootstrap admin's seeded one, and later any admin-issue reset.
  // Cleared by setPassword.
  mustChangePassword: boolean('mustChangePassword').notNull().default(false),
});

/**
 * Runtime application settings — a deliberate singleton (the `id = 1` check
 * permits exactly one row). This is mutable admin-toggled state, distinct from
 * the boot-time per-deployment `config/` surface.
 */
export const appSettings = pgTable(
  'app_settings',
  {
    id: integer('id').primaryKey().default(1),
    maintenanceMode: boolean('maintenanceMode').notNull().default(false),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Who last changed a setting, for audit. Null for the seeded default row.
    updatedBy: uuid('updatedBy').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [check('app_settings_singleton', sql`${t.id} = 1`)],
);

export const syncRunStatus = pgEnum('sync_run_status', [
  'previewed',
  'applied',
  'failed',
]);

// `api` is the headless entry point — specified but not built yet, since it
// needs a non-cookie credential.
export const syncRunSource = pgEnum('sync_run_source', ['upload', 'api']);

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
  status: syncRunStatus('status').notNull().default('previewed'),
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
  options: jsonb('options').$type<SyncOptions>().notNull(),
  summary: jsonb('summary').$type<SyncSummary>().notNull(),
  rows: jsonb('rows').$type<SyncRow[]>(),
  // Rows the file itself could not yield (bad price, missing/duplicate
  // sourceId). Staged with `rows` so a commit's re-diff reports the same error
  // count the preview showed — the parse happens once, at upload.
  parseErrors: jsonb('parseErrors').$type<SyncRowError[]>(),
  error: text('error'),
});
