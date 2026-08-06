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
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/**
 * Postgres `tsvector`, which drizzle has no built-in type for. Only ever
 * written by the database (generated column) and read by the index, so the
 * TypeScript side is a plain string and no parsing is needed.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

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
 * `sourceId` — while `sortOrder`, `image`, `description` and `shortName` are
 * admin overlay
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
  // An optional nickname shown where the parent category is already visible
  // (tiles, subcategory chips, breadcrumbs) — "Arabica" under "Coffee Beans"
  // for an imported "Coffee Beans Arabica". Null means: use `name`.
  shortName: varchar('shortName', { length: 255 }),
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
 * upsert key and is never serialized to the API. `name`, `defaultPriceMinor` and
 * `categoryId` are file-owned; `descriptionHtml`, `attributes` and the images
 * (see product_images) are admin overlay that a re-sync leaves untouched.
 * Missing-from-source rows are soft-deleted via `deletedAt`, never removed.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: varchar('sourceId', { length: 255 }).notNull().unique(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 512 }).notNull(),
    // The default list's price — the base every product has. The additional
    // tiers' prices live in product_prices and fall back to this one wherever
    // they have no row.
    defaultPriceMinor: integer('defaultPriceMinor').notNull(),
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
    // Search index over the product name (FR-SEARCH-02), maintained by the
    // database itself, so neither a sync nor an admin rename can leave it
    // stale. Never selected — it exists only for the GIN index below, which is
    // why every products query lists its columns explicitly.
    nameTsv: tsvector('nameTsv').generatedAlwaysAs(
      sql`to_tsvector('simple', search_unaccent("name"))`,
    ),
  },
  (t) => [
    index('products_nameTsv_idx').using('gin', t.nameTsv),
    // The trigram half of the score. An expression index, so it must spell the
    // unaccent wrapper exactly as the query does or the query will not use it.
    index('products_name_trgm_idx').using(
      'gin',
      sql`search_unaccent("name") gin_trgm_ops`,
    ),
  ],
);

/**
 * The **additional** customer tiers of FR-AUTH-05 — rows rather than a
 * code-level enum, because tier names are a deployment's own commercial
 * vocabulary and adding one must not be a release.
 *
 * Tiers are **unordered**. They are distinct customer kinds (wholesale,
 * partner, …), not steps on a scale, so nothing ranks them and none inherits
 * from another.
 *
 * The default tier is deliberately **not a row here**. It is
 * `products.defaultPriceMinor` itself: the list served to guests, crawlers, and
 * every account without a `tierId`. Modelling it as data would invite a
 * deployment to have two of them or none, and would need a guard to stop it
 * being deleted; as a column it simply always exists, exactly once. The admin
 * UI presents it alongside these rows, labelled from the deployment's text
 * config rather than from the database.
 *
 * `key` is the stable machine identifier the bulk import addresses a price list
 * by (`price:<key>` columns); `label` is what staff see. `key` cannot be
 * `default` — that name addresses the base list, which is not one of these
 * rows.
 */
export const customerTiers = pgTable(
  'customer_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 64 }).notNull().unique(),
    label: varchar('label', { length: 255 }).notNull(),
    /**
     * Display order for staff screens only — the tier list and the per-tier
     * price fields in the product editor, so the tier an admin edits most sits
     * first. It carries no pricing meaning whatsoever: tiers do not rank, none
     * inherits from another, and nothing resolves a price by position. Same
     * column, same intent as `categories.sortOrder`.
     */
    sortOrder: integer('sortOrder').notNull().default(0),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updatedBy').references((): AnyPgColumn => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [check('customer_tiers_key_not_default', sql`${t.key} <> 'default'`)],
);

/**
 * A product's price in one of the additional tiers. The default list is
 * `products.defaultPriceMinor`, so the guest path needs no join at all and the
 * base price can never be missing. A tier with no row here for a product falls
 * back to that column, which is what lets a tier carry only its exceptions;
 * since tiers are unordered, that fallback is always to the base list, never to
 * some neighbouring tier.
 *
 * `tierId` restricts rather than cascades: dropping a tier would silently
 * re-price every product that had an override, so a tier still holding prices
 * cannot be deleted until they are cleared.
 */
export const productPrices = pgTable(
  'product_prices',
  {
    productId: uuid('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    tierId: uuid('tierId')
      .notNull()
      .references(() => customerTiers.id, { onDelete: 'restrict' }),
    priceMinor: integer('priceMinor').notNull(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.productId, t.tierId] }),
    // The PK covers product-leading lookups (resolving one listing page); this
    // covers tier-leading ones (the delete guard, per-tier admin views).
    index('product_prices_tierId_idx').on(t.tierId),
  ],
);

// New signups default to `user`; `admin`/`manager` are assigned deliberately.
export const userRole = pgEnum('user_role', ['admin', 'manager', 'user']);

// Account lifecycle. `pending` = self-registered, waiting for staff approval.
// `invited` = staff approved it and a set-your-password link is out; the tier
// is assigned but the account still has no password of its own. `active` = the
// link was redeemed and the account can sign in. `anonymized` = self-deleted:
// the row survives because audit entries and the `updatedBy` columns point at
// it, but it can never sign in again.
//
// Only `active` may authenticate — see JwtAuthGuard. The state also tells a
// password token what it is *for* without the token carrying a purpose: a link
// redeemed by an `invited` account sets a first password, one redeemed by an
// `active` account resets an existing one.
export const userStatus = pgEnum('user_status', [
  'pending',
  'invited',
  'active',
  // Switched off by staff and switchable back on: the person who left, the
  // customer who stopped ordering. Distinct from `anonymized`, which erases
  // who they were — a deactivated account keeps its name so the audit trail
  // and every approvedBy/updatedBy reference still point at somebody.
  'disabled',
  'anonymized',
]);

// What kind of customer registered (FR-AUTH-01). Declared by the registrant and
// left as declared: it is evidence for the staff member approving the account,
// never an automatic tier assignment (ADR 0031 — a company can buy at retail
// volumes, and no tier is a default).
export const customerType = pgEnum('customer_type', ['person', 'company']);

// Plural table name (the singular `user` is a Postgres reserved word, awkward in
// the raw-SQL seed/bootstrap statements). Email is the login identifier.
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: text('passwordHash').notNull(),
  role: userRole('role').notNull().default('user'),
  // Defaults to `pending`, the safe end: an account only becomes usable when
  // something sets `active` deliberately (staff approval, or the bootstrap
  // admin insert). A forgotten status can lock an account out, never let one in.
  status: userStatus('status').notNull().default('pending'),
  // Who registered, as they described themselves. This is what makes approval a
  // decidable act: staff match these against their own customer records, and a
  // pending account has no way to be asked anything. All nullable — staff
  // accounts are created by other staff and describe nobody, and phase 5's
  // anonymization clears every one of them.
  firstName: varchar('firstName', { length: 200 }),
  lastName: varchar('lastName', { length: 200 }),
  phone: varchar('phone', { length: 50 }),
  customerType: customerType('customerType'),
  // Business registration number, stored unmasked (digits or whatever the
  // deployment's pattern accepts) so it matches the legacy system's records
  // regardless of how it is displayed. Required for `company` registrations —
  // enforced by the registration contract and the deployment's own pattern,
  // not by the column, since staff-created accounts have neither.
  companyRegistrationId: varchar('companyRegistrationId', { length: 64 }),
  // Set together when staff approve an account (or create one outright). Null
  // on the bootstrap admin and on rows that predate registration.
  approvedAt: timestamp('approvedAt', { withTimezone: true }),
  approvedBy: uuid('approvedBy').references((): AnyPgColumn => users.id, {
    onDelete: 'set null',
  }),
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
  // The pricing group (FR-AUTH-05) — independent of `role`, which is
  // authorization only. Null is a normal, permanent state, not a placeholder:
  // it means the default list (`products.defaultPriceMinor`), which is what
  // staff and any customer not put in a specific tier get.
  // Restricted, not nulled, on tier delete: silently moving a customer onto
  // default prices is worse than refusing the delete.
  tierId: uuid('tierId').references(() => customerTiers.id, {
    onDelete: 'restrict',
  }),
});

/**
 * Single-use links that let someone set a password without one being mailed to
 * them: the invitation staff send on approval (FR-AUTH-01/03) and the reset a
 * visitor asks for (FR-AUTH-02). One table for both — what a link *means* is
 * read from the account's status, not stored here, so an expired invitation
 * followed by a reset request still lands on "choose your password".
 *
 * Only the SHA-256 of the token is stored, never the token: whoever holds the
 * link holds the credential, and a leaked database must not yield working
 * links. SHA-256 rather than argon2 precisely because it is deterministic —
 * the token is 256 bits of randomness, so it needs no slow KDF, and a
 * deterministic hash is what lets the link be looked up by itself instead of
 * carrying a row id beside the secret.
 */
export const passwordTokens = pgTable('password_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('userId')
    .notNull()
    // A purged registration takes its unredeemed invitation with it.
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('tokenHash', { length: 64 }).notNull().unique(),
  expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  // Set on redemption. Kept rather than deleted so a second click on the same
  // link can say "already used" instead of "never existed".
  usedAt: timestamp('usedAt', { withTimezone: true }),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
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
