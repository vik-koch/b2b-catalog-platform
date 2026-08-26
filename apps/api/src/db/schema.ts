import { sql } from 'drizzle-orm';
import {
  FULFILMENT_METHODS,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PRODUCT_UNITS,
  type SyncOptions,
  type SyncRow,
  type SyncRowError,
  type SyncSummary,
} from '@b2b-catalog-platform/shared';
import {
  AnyPgColumn,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  numeric,
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

/**
 * One gallery image, stored as two media-store URLs: `thumb` for the grid/list
 * (and search) so those views load little, `full` for the product page. No alt
 * is kept — the UI uses the product name. Order is the array order.
 */
export type ProductImageRef = { full: string; thumb: string };

/**
 * Catalog products. `sourceId` (the legacy system's private id) is the sync
 * upsert key and is never serialized to the API. `name`, `defaultPriceMinor` and
 * `categoryId` are file-owned; `descriptionHtml`, the attributes (see
 * product_attributes) and the images are admin overlay that a re-sync leaves
 * untouched.
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
    // they have no row. It is the price of `priceBasisPieces` pieces.
    defaultPriceMinor: integer('defaultPriceMinor').notNull(),
    // How many pieces the stored price covers; 1 means per piece. Staff-facing:
    // the read layer resolves prices per unit and only the resolved figures are
    // ever serialized.
    priceBasisPieces: integer('priceBasisPieces').notNull().default(1),
    // Packaging. Null means the product is not sold in that unit. Admin-owned —
    // the sync does not carry them.
    piecesPerPack: integer('piecesPerPack'),
    packsPerBox: integer('packsPerBox'),
    // Minimum piece quantity, and equally the increment. Piece purchases only.
    minPieceQty: integer('minPieceQty').notNull().default(1),
    // A box's shipping dimensions, shown among the product's attributes. Plain
    // numerics: the integer-money rule is about currency rounding, which does
    // not apply to mass and volume. Unit labels are deployment config.
    boxVolume: numeric('boxVolume', { precision: 12, scale: 3 }),
    boxWeight: numeric('boxWeight', { precision: 12, scale: 3 }),
    // How many boxes the product ships as. Informational only: the volume and
    // weight above already describe the whole consignment, so nothing is
    // multiplied by this. Shown to the customer only where it exceeds 1.
    boxCount: integer('boxCount').notNull().default(1),
    categoryId: uuid('categoryId')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    // Overlay fields.
    descriptionHtml: text('descriptionHtml').notNull().default(''),
    // Whether a cart line for this product may carry a free-text note, for
    // collective items whose variants are not separate articles. Admin-owned,
    // like the packaging above — the sync does not carry it.
    lineNoteEnabled: boolean('lineNoteEnabled').notNull().default(false),
    // What to ask for, since the reason for the note differs per product
    // ("state the colour"). Null falls back to the app-wide wording.
    lineNotePrompt: varchar('lineNotePrompt', { length: 200 }),
    // Ordered gallery, each with a full and a thumb media-store URL. The
    // media-prune reference scan must include these URLs (and categories.image)
    // so seeded/uploaded images are not swept.
    images: jsonb('images')
      .$type<ProductImageRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    // Null until an admin publishes. Independent of deletedAt: a product can be
    // synced, never published, and then vanish from the source. The bulk sync
    // never sets it, so a new product waits for review — its price basis is
    // admin-entered and nobody has checked it yet.
    publishedAt: timestamp('publishedAt', { withTimezone: true }),
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
    // Who accepted responsibility for the price going public.
    publishedBy: uuid('publishedBy').references(() => users.id, {
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
    check(
      'products_units_positive',
      sql`${t.priceBasisPieces} >= 1 and ${t.minPieceQty} >= 1
        and ${t.boxCount} >= 1
        and (${t.piecesPerPack} is null or ${t.piecesPerPack} >= 1)
        and (${t.packsPerBox} is null or ${t.packsPerBox} >= 1)`,
    ),
    // A box's piece count is piecesPerPack * packsPerBox, so the outer level
    // needs the inner one.
    check(
      'products_box_needs_pack',
      sql`${t.packsPerBox} is null or ${t.piecesPerPack} is not null`,
    ),
    // A count of boxes is meaningless without a box.
    check(
      'products_box_count_needs_box',
      sql`${t.boxCount} = 1 or ${t.packsPerBox} is not null`,
    ),
    // What keeps totals exact: every purchasable quantity is a whole number of
    // basis units, so a total is a multiplication with nothing to round. In the
    // database, not only the editor — it is the guarantee, not a form nicety.
    // A prompt describes a note nobody can write unless the note is enabled.
    check(
      'products_line_note_prompt_needs_note',
      sql`${t.lineNotePrompt} is null or ${t.lineNoteEnabled}`,
    ),
    check(
      'products_basis_divides_quantities',
      sql`${t.minPieceQty} % ${t.priceBasisPieces} = 0
        and (${t.piecesPerPack} is null
             or ${t.piecesPerPack} % ${t.priceBasisPieces} = 0)`,
    ),
  ],
);

/**
 * A product's freetext characteristics — plain key/value, entered in the admin
 * grid. Rows rather than a jsonb column, so a value can be filtered on and
 * counted without unpacking every product (ADR 0037).
 *
 * `key` is the match to `attribute_definitions.name`: plain text, never a
 * foreign key, so a definition can be added, renamed or retyped without
 * touching a product. `valueNumeric` is parsed from `value` whenever it reads
 * as a number (`parseAttributeNumber`), independent of any definition — an
 * unparseable value keeps its text and simply has no numeric form.
 *
 * Order is data: `sortOrder` is the grid's row order, so every read must sort
 * by it explicitly. The editor's list is the whole truth — a product save
 * replaces these rows wholesale, exactly like product_prices.
 */
export const productAttributes = pgTable(
  'product_attributes',
  {
    productId: uuid('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sortOrder: integer('sortOrder').notNull(),
    key: varchar('key', { length: 200 }).notNull(),
    value: varchar('value', { length: 2000 }).notNull(),
    valueNumeric: numeric('valueNumeric', { precision: 18, scale: 6 }),
  },
  (t) => [
    // The PK is the read order as well as the identity: one row per grid line.
    primaryKey({ columns: [t.productId, t.sortOrder] }),
    // Facet counting and the attribute inventory both lead with the key.
    index('product_attributes_key_value_idx').on(t.key, t.value),
  ],
);

/** A filterable attribute's kind. Two is enough: text sorts as text, a number sorts numerically. */
export const attributeType = pgEnum('attribute_type', ['text', 'number']);

/**
 * The registry of filterable attributes (FR-ATTR-01) — which of the freetext
 * keys staff type into a product's attribute grid are worth filtering by.
 *
 * A **registry, not a schema**: a definition constrains nothing a product may
 * carry, and holds no data of its own. `name` is matched against
 * `product_attributes.key` exactly (both sides are trimmed), so a definition
 * added today takes effect on products entered months ago, and retyping or
 * renaming one rebuilds nothing — `valueNumeric` is parsed on the row whatever
 * this table says.
 *
 * `slug` is the stable key a filtered listing URL is written with, so it
 * survives renaming the attribute. `unit` is a display suffix ("cm"): it lives
 * here and never inside a value, or "30 cm" and "30cm" become two facets.
 */
export const attributeDefinitions = pgTable('attribute_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull().unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  type: attributeType('type').notNull().default('text'),
  unit: varchar('unit', { length: 32 }),
  /** Where the attribute sits in the filter panel. Presentation only. */
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
});

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
  // accounts are created by other staff and describe nobody, and
  // anonymization clears every one of them.
  firstName: varchar('firstName', { length: 200 }),
  lastName: varchar('lastName', { length: 200 }),
  phone: varchar('phone', { length: 50 }),
  customerType: customerType('customerType'),
  // The invoiced party, as the customer gave it. Both are required for a
  // `company` registration — enforced by the registration contract, not by the
  // columns, since staff accounts describe nobody and rows predating this
  // carry only the number.
  //
  // The name is here as well as on an address because an address may be
  // invoiced to another of the customer's entities; this is the one the account
  // was approved on, and what a new address prefills from.
  companyName: varchar('companyName', { length: 255 }),
  // Business registration number, stored normalized (no spaces, upper case —
  // see the contract) so it matches the legacy system's records regardless of
  // how it was typed.
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
 * The account's address book (FR-CART-04) — where its orders are delivered and
 * invoiced. Rows belong to one account and are always read through its id.
 *
 * A row is really a *profile*: where goods go, and who is invoiced for them.
 * `label` is an optional name for it — an address the customer never bothered
 * to name is shown by its own first line — and `companyName`/`companyId` sit
 * here rather than being read off the account, because the registration number
 * staff approved the account on is not necessarily the entity an invoice goes
 * to.
 *
 * Rows are **not typed** as delivery or billing. The same address usually
 * serves both, the two roles ask different things of it (only the invoiced one
 * needs a company), and a stored role would be a second source of truth that
 * the row itself contradicts the moment it is edited. Checkout picks a role per
 * order, and the server re-checks the company fields at submission — which is
 * the one place that rule belongs.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      // Deleting an account takes its book with it; orders keep their own
      // snapshot of the address, so nothing readable is lost.
      .references(() => users.id, { onDelete: 'cascade' }),
    label: varchar('label', { length: 100 }),
    companyName: varchar('companyName', { length: 255 }),
    // The invoiced party's registration number, in the same shape and the same
    // column width as `users.companyRegistrationId` — the deployment's own
    // formats apply to both. Null where the party is a natural person.
    companyId: varchar('companyId', { length: 64 }),
    // The street line as it is printed, house number included.
    street: varchar('street', { length: 255 }).notNull(),
    street2: varchar('street2', { length: 255 }),
    postalCode: varchar('postalCode', { length: 32 }).notNull(),
    city: varchar('city', { length: 255 }).notNull(),
    region: varchar('region', { length: 255 }),
    // ISO 3166-1 alpha-2. A code, not free text: it is snapshotted onto orders,
    // and a column that reads `DE` on one and `Deutschland` on the next is one
    // nobody can group by. Which codes are accepted is deployment config.
    country: varchar('country', { length: 2 }).notNull(),
    phone: varchar('phone', { length: 50 }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index('addresses_userId_idx').on(t.userId)],
);

/**
 * A closed set of string values, as a check constraint rather than a pgEnum.
 *
 * Migrations run as one transaction (`migrate.ts`), and Postgres forbids *using*
 * an enum value added in the same transaction — so a later migration that adds
 * a status and then references it would fail on a fresh database and pass on an
 * incrementally migrated one. A check is dropped and recreated freely; an enum
 * value can never be removed at all.
 *
 * Raw rather than parameterized: these are the contract's own constants, and a
 * bound parameter would land in the generated migration as a placeholder.
 */
function oneOf(column: string, values: readonly string[]) {
  const list = values.map((value) => `'${value}'`).join(', ');
  return sql.raw(`"${column}" in (${list})`);
}

/**
 * An order request (FR-CART-03). A request, not a sale: it is priced, recorded
 * and mailed, and a manager confirms it.
 *
 * Almost everything here is a **snapshot**. The addresses, the contact details,
 * the pickup office and the currency are copied in as they read at the time,
 * because all of them are editable elsewhere and an order has to stay readable
 * exactly as it was placed. `deliveryAddressId`/`billingAddressId` point at the
 * book rows they came from only so the next order can default to them — they
 * are `set null`, and nothing reads an address through them.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Quoted on the phone: `{prefix}-YYMMDD-NNNN` with a random suffix, so the
    // shop's daily volume is not on every mail it sends.
    reference: varchar('reference', { length: 32 }).notNull().unique(),
    // The capability a mailed link carries (FR-NOTIF-06): a guest has no
    // account to read their order from. Unguessable, and the only credential
    // for that view.
    publicToken: varchar('publicToken', { length: 64 }).notNull().unique(),
    // Null for a guest order. Never `set null`: accounts are anonymized rather
    // than deleted, and the tombstone exists to keep this link.
    userId: uuid('userId').references(() => users.id, {
      onDelete: 'no action',
    }),
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    // A status with no date is a status with no story — and the transitions
    // that arrive later then find a trail already there.
    statusChangedAt: timestamp('statusChangedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    statusChangedBy: uuid('statusChangedBy').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Who to talk to about this order — asked on the form rather than read off
    // the account, since a guest has none and a colleague may take the call.
    contactName: varchar('contactName', { length: 200 }).notNull(),
    contactEmail: varchar('contactEmail', { length: 255 }).notNull(),
    contactPhone: varchar('contactPhone', { length: 50 }).notNull(),
    paymentMethod: varchar('paymentMethod', { length: 20 }).notNull(),
    fulfilmentMethod: varchar('fulfilmentMethod', { length: 20 }).notNull(),
    // The invoiced party. The company pair lives here, not on the delivery
    // snapshot: a delivery address may carry a company name with no number
    // (a branch, a warehouse), and only the invoice needs the registration.
    billingCompanyName: varchar('billingCompanyName', { length: 255 }),
    billingCompanyId: varchar('billingCompanyId', { length: 64 }),
    billingStreet: varchar('billingStreet', { length: 255 }).notNull(),
    billingStreet2: varchar('billingStreet2', { length: 255 }),
    billingPostalCode: varchar('billingPostalCode', { length: 32 }).notNull(),
    billingCity: varchar('billingCity', { length: 255 }).notNull(),
    billingRegion: varchar('billingRegion', { length: 255 }),
    billingCountry: varchar('billingCountry', { length: 2 }).notNull(),
    billingPhone: varchar('billingPhone', { length: 50 }),
    billingAddressId: uuid('billingAddressId').references(() => addresses.id, {
      onDelete: 'set null',
    }),
    // The delivery snapshot, or nothing at all for a pickup.
    deliveryCompanyName: varchar('deliveryCompanyName', { length: 255 }),
    deliveryStreet: varchar('deliveryStreet', { length: 255 }),
    deliveryStreet2: varchar('deliveryStreet2', { length: 255 }),
    deliveryPostalCode: varchar('deliveryPostalCode', { length: 32 }),
    deliveryCity: varchar('deliveryCity', { length: 255 }),
    deliveryRegion: varchar('deliveryRegion', { length: 255 }),
    deliveryCountry: varchar('deliveryCountry', { length: 2 }),
    deliveryPhone: varchar('deliveryPhone', { length: 50 }),
    deliveryAddressId: uuid('deliveryAddressId').references(
      () => addresses.id,
      { onDelete: 'set null' },
    ),
    // The zone the postal code resolved to, and the free-delivery threshold it
    // promised. Advisory (FR-CART-07): it never blocked the order and never
    // priced the delivery. Snapshotted because the config behind it is edited.
    deliveryZoneKey: varchar('deliveryZoneKey', { length: 64 }),
    deliveryFreeFromMinor: integer('deliveryFreeFromMinor'),
    // The pickup office: its key, and its name and address as they read at the
    // time, since config is editable and an old order must stay readable.
    pickupLocationKey: varchar('pickupLocationKey', { length: 64 }),
    pickupLocationName: varchar('pickupLocationName', { length: 255 }),
    pickupLocationAddress: text('pickupLocationAddress'),
    // Free text: scheduling is coordinated by phone or mail (FR-CART-07), so a
    // structured window would be a field nothing consumes.
    preferredTiming: varchar('preferredTiming', { length: 200 }),
    customerNote: text('customerNote'),
    totalMinor: integer('totalMinor').notNull(),
    // The shipment estimate as it was shown (FR-UNIT-11), snapshotted rather
    // than re-derived: packaging is admin-owned and editable, and an order must
    // keep saying what the customer was told it would be. Approximate wherever
    // a line did not fill whole boxes; `shipmentUncoveredLines` counts the
    // lines with no box to derive from at all.
    shipmentCartons: integer('shipmentCartons').notNull().default(0),
    shipmentVolume: numeric('shipmentVolume', { precision: 12, scale: 3 }),
    shipmentWeight: numeric('shipmentWeight', { precision: 12, scale: 3 }),
    shipmentApproximate: boolean('shipmentApproximate')
      .notNull()
      .default(false),
    shipmentUncoveredLines: integer('shipmentUncoveredLines')
      .notNull()
      .default(0),
    // The currency lives in deployment config and could change under an old
    // order, so the order says which one it was priced in.
    currency: varchar('currency', { length: 8 }).notNull(),
    // Staff-facing: which price list this was taken from. Null is the default
    // list. Never serialized to the customer, and cleared by anonymization for
    // the same reason `users.tierId` is.
    tierKey: varchar('tierKey', { length: 64 }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('orders_userId_idx').on(t.userId),
    index('orders_createdAt_idx').on(t.createdAt),
    check('orders_status_known', oneOf('status', ORDER_STATUSES)),
    check('orders_payment_known', oneOf('paymentMethod', PAYMENT_METHODS)),
    check(
      'orders_fulfilment_known',
      oneOf('fulfilmentMethod', FULFILMENT_METHODS),
    ),
    // Each fulfilment carries exactly its own destination: a delivery has an
    // address and no office, a pickup an office and no address.
    check(
      'orders_fulfilment_destination',
      sql`case when ${t.fulfilmentMethod} = 'delivery'
        then ${t.deliveryStreet} is not null
          and ${t.deliveryPostalCode} is not null
          and ${t.deliveryCity} is not null
          and ${t.deliveryCountry} is not null
          and ${t.pickupLocationKey} is null
        else ${t.pickupLocationKey} is not null
          and ${t.deliveryStreet} is null
        end`,
    ),
  ],
);

/**
 * An ordered line, frozen. The product is linked by id and described by
 * snapshot: a rename, a re-price or a soft delete must not rewrite what
 * somebody ordered, and the read layer degrades to plain text where the product
 * is no longer visible.
 *
 * There is deliberately **no per-unit price column**. A piece has no exact
 * integer price where the stored price covers several (19.99 for ten is 1.999
 * each), so a rounded per-unit figure sitting beside the total would be a
 * column that looks multiplicable and is not — and every later consumer would
 * reach for it. `priceMinor` + `priceBasisPieces` keep the line exact and
 * reconstructible; a per-unit figure for display is derived at render time.
 */
export const orderItems = pgTable(
  'order_items',
  {
    orderId: uuid('orderId')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    sortOrder: integer('sortOrder').notNull(),
    // Restrict rather than cascade: products are soft-deleted, never removed,
    // and an order line must not be able to lose its product.
    productId: uuid('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    // Staff- and ERP-facing, like `products.sourceId` itself: never serialized.
    productSourceId: varchar('productSourceId', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    name: varchar('name', { length: 512 }).notNull(),
    // The thumb URL only. Covered by the media-prune reference scan, like
    // `products.images` and `categories.image`.
    thumbnail: text('thumbnail'),
    unit: varchar('unit', { length: 10 }).notNull(),
    // In the chosen unit, and the pieces that came to — the unit is never
    // normalized, so four packs stay four packs even where a box holds four.
    quantity: integer('quantity').notNull(),
    pieces: integer('pieces').notNull(),
    // The tier-resolved price of `priceBasisPieces` pieces, as it stood.
    priceMinor: integer('priceMinor').notNull(),
    priceBasisPieces: integer('priceBasisPieces').notNull(),
    lineTotalMinor: integer('lineTotalMinor').notNull(),
    // Customer-typed, for a collective item's variant. Scrubbed by
    // anonymization: it can perfectly well read "deliver to Anna, 0170…".
    note: varchar('note', { length: 500 }),
  },
  (t) => [
    // The PK is the read order as well as the identity, like product_attributes.
    primaryKey({ columns: [t.orderId, t.sortOrder] }),
    check('order_items_unit_known', oneOf('unit', PRODUCT_UNITS)),
    check(
      'order_items_quantities_positive',
      sql`${t.quantity} >= 1 and ${t.pieces} >= 1 and ${t.priceBasisPieces} >= 1`,
    ),
    // The exactness rule, in the database: a line total is a multiplication of
    // whole basis units, with nothing rounded.
    check(
      'order_items_total_exact',
      sql`${t.pieces} % ${t.priceBasisPieces} = 0
        and ${t.lineTotalMinor} = ${t.priceMinor} * (${t.pieces} / ${t.priceBasisPieces})`,
    ),
  ],
);

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
