import { sql } from 'drizzle-orm';
import {
  API_TOKEN_NAME_MAX_LENGTH,
  API_TOKEN_PREFIX_LENGTH,
  API_TOKEN_SCOPES,
  FULFILMENT_METHODS,
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_DOCUMENT_KINDS,
  ORDER_REVISION_KINDS,
  ORDER_STATUS_REASON_MAX,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATES,
  PRODUCT_AVAILABILITIES,
  PRODUCT_UNITS,
  type SyncOptions,
  type SyncPlan,
  type SyncRow,
  type SyncRowError,
  type SyncSummary,
} from '@b2b-catalog-platform/shared';
import {
  AnyPgColumn,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
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

/** The three states a stock figure resolves to (FR-STOCK-02). */
export const productAvailabilityEnum = pgEnum('product_availability', [
  ...PRODUCT_AVAILABILITIES,
]);

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
    // The smallest piece quantity the shop will sell — a commercial floor, not
    // the increment. Where it is a whole number of packs, piece quantities move
    // by one pack; where it is under a pack, packs are opened and they move by
    // ones (see pieceStep). This only says where they start.
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
    // How many pieces are on hand (FR-STOCK-01). Staff-facing: the figure
    // never leaves the API. Null means this deployment does not track stock for
    // this product, which is the default — no badge, no restriction. A negative
    // figure is a stocktake correction and reads as none in stock.
    stockPieces: integer('stockPieces'),
    // Where "few left" sits for this product, overriding the box/pack/config
    // ladder. Null is the ladder.
    lowStockThresholdPieces: integer('lowStockThresholdPieces'),
    // The public half of the two above, recomputed on every write that can move
    // it — stock, threshold or packaging (FR-STOCK-02). Stored rather than
    // derived per query so it can lead an indexed sort; null wherever
    // stockPieces is.
    availability: productAvailabilityEnum('availability'),
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
    // Availability leads every listing's sort (FR-STOCK-05), so it is indexed
    // rather than computed per query.
    index('products_availability_idx').on(t.availability),
    index('products_nameTsv_idx').using('gin', t.nameTsv),
    // The trigram half of the score. An expression index, so it must spell the
    // unaccent wrapper exactly as the query does or the query will not use it.
    index('products_name_trgm_idx').using(
      'gin',
      sql`search_unaccent("name") gin_trgm_ops`,
    ),
    // The stored state is the stock figure's shadow: either both are there or
    // neither is. A recompute that forgot one of them is a constraint
    // violation rather than a wrong badge.
    check(
      'products_availability_tracks_stock',
      sql`(${t.stockPieces} is null) = (${t.availability} is null)`,
    ),
    // A threshold describes a stock nobody is counting otherwise, and "few
    // left at or below zero" is out of stock, which the state already says.
    check(
      'products_low_stock_threshold_positive',
      sql`${t.lowStockThresholdPieces} is null
        or (${t.lowStockThresholdPieces} >= 1 and ${t.stockPieces} is not null)`,
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
    // A prompt describes a note nobody can write unless the note is enabled.
    check(
      'products_line_note_prompt_needs_note',
      sql`${t.lineNotePrompt} is null or ${t.lineNoteEnabled}`,
    ),
    // What keeps totals exact: every purchasable quantity is a whole number of
    // basis units, so a total is a multiplication with nothing to round. In the
    // database, not only the editor — it is the guarantee, not a form nicety.
    // The last clause is the broken-open case: a minimum under a pack lets
    // pieces be bought one at a time, and only a per-piece price describes those
    // totals exactly.
    check(
      'products_basis_divides_quantities',
      sql`${t.minPieceQty} % ${t.priceBasisPieces} = 0
        and (${t.piecesPerPack} is null
             or ${t.piecesPerPack} % ${t.priceBasisPieces} = 0)
        and (${t.piecesPerPack} is null
             or ${t.minPieceQty} >= ${t.piecesPerPack}
             or ${t.priceBasisPieces} = 1)`,
    ),
    // The minimum must sit with the pack rather than across it: either under one
    // pack, where packs are opened and pieces move by ones, or a whole number of
    // packs, where they are not. In between — a minimum of 8 against a pack of 6
    // — the first orderable quantity is off every lattice, and one published lot
    // price can no longer describe every total.
    check(
      'products_minimum_fits_packs',
      sql`${t.piecesPerPack} is null
        or ${t.minPieceQty} < ${t.piecesPerPack}
        or ${t.minPieceQty} % ${t.piecesPerPack} = 0`,
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
 * A category's own filter panel (FR-ATTR-11) — which filterable attributes it
 * offers and in what order.
 *
 * An **overlay of deviations**: a category with no rows here offers every
 * definition present among its products, in the registry's own order, which is
 * what a category did before this table existed. A category with rows replaces
 * that list wholesale with the rows it carries, and a category with none
 * inherits the nearest ancestor that has some — so an override set on "Coffee"
 * covers every subcategory without being restated.
 *
 * Replacing means replacing: an attribute declared *after* an overlay was
 * saved is in no row of it and is not offered there either. It appears by
 * itself only under categories that inherit nothing — everywhere else it is a
 * row somebody adds, and the filters editor lists it unticked so it can be
 * found.
 *
 * Rows are written wholesale on save, like `product_attributes` — the editor's
 * list is the whole truth.
 */
export const categoryAttributes = pgTable(
  'category_attributes',
  {
    categoryId: uuid('categoryId')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    attributeId: uuid('attributeId')
      .notNull()
      .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
    /** Where the attribute sits in this category's panel. */
    sortOrder: integer('sortOrder').notNull(),
    /** Kept rather than deleted, so the row survives a reorder either way. */
    hidden: boolean('hidden').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.attributeId] })],
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

/**
 * Products sold together (FR-SET-01): an undirected edge between two products,
 * stored once. The check constraint is what makes "once" true — the smaller id
 * is always the A side, so a pair has exactly one row whichever product was
 * being edited, and a product cannot be paired with itself.
 *
 * Admin-owned like the packaging: a bulk sync neither creates nor clears these.
 * Cascade on both sides, because an edge to a product that no longer exists is
 * not a pairing. A *soft*-deleted product keeps its edges — the deletion is
 * reversible, and clearing them would silently rewrite the counterpart's own
 * set from a screen nobody opened.
 */
export const productPairings = pgTable(
  'product_pairings',
  {
    productAId: uuid('productAId')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    productBId: uuid('productBId')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.productAId, t.productBId] }),
    // The PK answers the A side; a product's neighbours are looked up from
    // both, and every read of this table is one product asking.
    index('product_pairings_productBId_idx').on(t.productBId),
    check(
      'product_pairings_canonical_order',
      sql`${t.productAId} < ${t.productBId}`,
    ),
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
  // When the account holder last chose a password of their own — null while
  // the stored hash is the unusable stand-in nobody holds. It is the only way
  // to tell those two apart, since the stand-in is a real argon2 hash by
  // design, and it is what decides where a reactivated account lands: back to
  // `active` if it has a password, to `invited` if it never chose one.
  passwordSetAt: timestamp('passwordSetAt', { withTimezone: true }),
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
 * A row is a **place**, and carries no identity: who an order is invoiced to is
 * a field of the order (ADR 0039), not a property of the address it is sent to.
 * `label` is an optional name for it — an address the customer never bothered
 * to name is shown by its own first line.
 *
 * Rows are **not typed** as delivery or billing either. The same address usually
 * serves both, and a stored role would be a second source of truth that the row
 * itself contradicts the moment it is edited. Checkout picks a role per order.
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
    // An address is a place, and carries no identity: who an order is invoiced
    // to is the order's own field, resolved from the account or typed, never
    // merged into the row a customer picked.
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
 * This row is the order's **identity and workflow** only — the number it is
 * quoted by, the link it is read through, whose it is, where it stands and
 * what it owes. Everything the order *says* lives on `order_revisions`, since
 * a manager who adjusts an order writes a new version of it rather than
 * editing this one (FR-ORD-03).
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Quoted on the phone: `{prefix}-YYMMDD-NNNN` with a random suffix, so the
    // shop's daily volume is not on every mail it sends. It survives every
    // adjustment, which is the whole reason adjustments are versions.
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
    // Which version every view shows. A column rather than "the highest
    // number", so one read answers it and nothing has to agree on how to find
    // the newest row. Nullable only because the order row is written first and
    // its first revision a statement later, inside the same transaction.
    currentRevisionId: uuid('currentRevisionId').references(
      (): AnyPgColumn => orderRevisions.id,
      { onDelete: 'no action' },
    ),
    // Which version the **customer** is shown, and so the last one they were
    // told about (FR-NOTIF-03). It follows the order while the order is still
    // running and stops when the order ends, so staff correcting a finished
    // record — reopening it, changing it, finishing it again — do not mail the
    // customer a lap of the workflow they never needed to see. Moving it on
    // afterwards is a deliberate act with its own button.
    customerRevisionId: uuid('customerRevisionId').references(
      (): AnyPgColumn => orderRevisions.id,
      { onDelete: 'no action' },
    ),
    // Where the order stands *now* — the query column: what the staff list
    // filters, sorts and counts by. What a reader is *shown* comes off the
    // revision they are looking at, which for a customer may be an earlier one.
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    // When it last moved, and who moved it. The latest transition only: an
    // order's full history is its revisions (FR-ORD-03), and this is the one
    // question a list answers without reading them.
    statusChangedAt: timestamp('statusChangedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    statusChangedBy: uuid('statusChangedBy').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Whether the money has arrived (FR-ORD-04) — a second fact, not a step in
    // the status above, because cash is paid after the goods are handed over
    // and any single chain would be wrong about it. Every order starts
    // `not-due`; acceptance moves the invoiced methods to `awaiting`.
    paymentState: varchar('paymentState', { length: 20 })
      .notNull()
      .default('not-due'),
    // When a manager recorded the money as received, and which one. Both null
    // until then, and both stay set afterwards — this is the record that it
    // happened, not a mutable flag.
    paidAt: timestamp('paidAt', { withTimezone: true }),
    paidBy: uuid('paidBy').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('orders_userId_idx').on(t.userId),
    index('orders_createdAt_idx').on(t.createdAt),
    check('orders_status_known', oneOf('status', ORDER_STATUSES)),
    check('orders_payment_state_known', oneOf('paymentState', PAYMENT_STATES)),
    // Paid is the one payment state with a story, and it is the whole story:
    // a paid order says when and by whom, and an unpaid one cannot claim
    // either.
    check(
      'orders_paid_recorded',
      sql`(${t.paymentState} = 'paid') = (${t.paidAt} is not null)`,
    ),
  ],
);

/**
 * What an order says, as of one version of it (FR-ORD-03, ADR 0051).
 *
 * Submission writes revision 1; every move through the workflow and every
 * staff adjustment writes the next one, and the order points at it. Superseded
 * revisions are kept and stay readable by staff — that is what makes the thread
 * the order's history rather than a pile of edits, and it is where a document
 * generated earlier says it came from.
 *
 * A revision is therefore a **complete** reading of the order at one moment,
 * status included. That is what lets the customer be shown a version the order
 * has since moved past (`orders.customerRevisionId`) without any screen having
 * to assemble one from two places.
 *
 * Almost everything here is a **snapshot**. The addresses, the contact details,
 * the pickup office and the currency are copied in as they read at the time,
 * because all of them are editable elsewhere and an order has to stay readable
 * exactly as it was placed. Which book row an address was picked from is not
 * recorded: the snapshot is the record, and the row itself is editable and
 * deletable, so an id back to it would be a reference to something else.
 */
export const orderRevisions = pgTable(
  'order_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('orderId')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    // 1 is what the customer submitted. Counted per order and unique, so two
    // managers adjusting the same order at the same moment cannot both write
    // the same version.
    revisionNumber: integer('revisionNumber').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Null on the customer's own submission, and on anything an outside system
    // writes back — this names a person, not an author in general.
    createdBy: uuid('createdBy').references(() => users.id, {
      onDelete: 'set null',
    }),
    // What this version was written for: the customer's submission, a move
    // through the workflow, or a change to what the order says. Stored rather
    // than derived — a reader should not have to diff two rows to find out why
    // one of them exists, and the customer's mail needs to know whether
    // anything about the order itself changed since they were last written to.
    kind: varchar('kind', { length: 20 }).notNull().default('adjustment'),
    // Where the order stood as of this version (FR-ORD-01). Every transition
    // writes a revision, so the thread is the order's whole history and any
    // version can be read back complete — which is what lets the customer be
    // shown one the order has since moved on from.
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    // Why an order was declined or called off (FR-ORD-02). Null on every other
    // status: the accepted ones explain themselves, and a blank string would
    // be a reason somebody's mail would quote as nothing at all.
    statusReason: varchar('statusReason', { length: ORDER_STATUS_REASON_MAX }),
    // What the manager says changed, in their words. It describes this version
    // and not the order; the customer's mail quotes it.
    note: varchar('note', { length: ORDER_ADJUSTMENT_NOTE_MAX }),
    // When the customer was written to about this version (FR-NOTIF-03), null
    // where they never were. Stamped rather than derived: the version the
    // customer is shown says what they are looking at, not which versions ever
    // put something in their inbox, and staff reading the thread need to know
    // which of them the customer has actually been told about.
    notifiedAt: timestamp('notifiedAt', { withTimezone: true }),
    // Who to talk to about this order — asked on the form rather than read off
    // the account, since a guest has none and a colleague may take the call.
    contactName: varchar('contactName', { length: 200 }).notNull(),
    contactEmail: varchar('contactEmail', { length: 255 }).notNull(),
    contactPhone: varchar('contactPhone', { length: 50 }).notNull(),
    paymentMethod: varchar('paymentMethod', { length: 20 }).notNull(),
    fulfilmentMethod: varchar('fulfilmentMethod', { length: 20 }).notNull(),
    // The invoiced party (person's name or company name), snapshotted
    // (FR-CART-09): the account's own, or anybody else the customer named.
    partyName: varchar('partyName', { length: 255 }).notNull(),
    // Null for a natural person. A company always has one — the same shape and
    // column width as `users.companyRegistrationId`, and the deployment's own
    // formats apply to both.
    partyRegistrationId: varchar('partyRegistrationId', { length: 64 }),
    // The invoice snapshot, or nothing at all where the deployment invoices no
    // address of its own (`billingAddressEnabled`). Nullable rather than
    // blank: an empty street is a street somebody could try to print, and a
    // column of empty strings cannot be told from one nobody filled in.
    billingStreet: varchar('billingStreet', { length: 255 }),
    billingStreet2: varchar('billingStreet2', { length: 255 }),
    billingPostalCode: varchar('billingPostalCode', { length: 32 }),
    billingCity: varchar('billingCity', { length: 255 }),
    billingRegion: varchar('billingRegion', { length: 255 }),
    billingCountry: varchar('billingCountry', { length: 2 }),
    // The delivery snapshot, or nothing at all for a pickup.
    deliveryStreet: varchar('deliveryStreet', { length: 255 }),
    deliveryStreet2: varchar('deliveryStreet2', { length: 255 }),
    deliveryPostalCode: varchar('deliveryPostalCode', { length: 32 }),
    deliveryCity: varchar('deliveryCity', { length: 255 }),
    deliveryRegion: varchar('deliveryRegion', { length: 255 }),
    deliveryCountry: varchar('deliveryCountry', { length: 2 }),
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
    // The day the customer asked for, if any. Scheduling itself is coordinated
    // by phone or mail (FR-CART-07) — this is the wish a manager works from,
    // and a date so it can be read back, sorted and compared as one. Carried
    // forward unchanged by an adjustment: it is the customer's wish, and a
    // manager overwriting it would be answering on their behalf.
    preferredDate: date('preferredDate'),
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
    // the same reason `users.tierId` is. A manager re-pricing an order from
    // another list (FR-CART-09) writes a revision that says so.
    tierKey: varchar('tierKey', { length: 64 }),
  },
  (t) => [
    // Unique, and the index every read of an order's versions uses.
    uniqueIndex('order_revisions_order_number_idx').on(
      t.orderId,
      t.revisionNumber,
    ),
    check('order_revisions_number_positive', sql`${t.revisionNumber} >= 1`),
    check('order_revisions_status_known', oneOf('status', ORDER_STATUSES)),
    check('order_revisions_kind_known', oneOf('kind', ORDER_REVISION_KINDS)),
    check(
      'order_revisions_payment_known',
      oneOf('paymentMethod', PAYMENT_METHODS),
    ),
    check(
      'order_revisions_fulfilment_known',
      oneOf('fulfilmentMethod', FULFILMENT_METHODS),
    ),
    // Each fulfilment carries exactly its own destination: a delivery has an
    // address and no office, a pickup an office and no address.
    check(
      'order_revisions_fulfilment_destination',
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
    // The version it belongs to, not the order: an adjusted order keeps the
    // lines it was submitted with, on the revision that carried them.
    revisionId: uuid('revisionId')
      .notNull()
      .references(() => orderRevisions.id, { onDelete: 'cascade' }),
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
    // The lens the line was bought through, and the piece count it was read
    // out of. `pieces` is the quantity: `quantity` is that reading, frozen, so
    // an order still says "0.2 bx" after the product is repacked. Nothing is
    // ever derived from it.
    unit: varchar('unit', { length: 10 }).notNull(),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
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
    primaryKey({ columns: [t.revisionId, t.sortOrder] }),
    check('order_items_unit_known', oneOf('unit', PRODUCT_UNITS)),
    check(
      'order_items_quantities_positive',
      // The reading only has to be positive: a line of two packs read as boxes
      // is 0.2 of one.
      sql`${t.quantity} > 0 and ${t.pieces} >= 1 and ${t.priceBasisPieces} >= 1`,
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
 * A document supplied for an order (FR-ORD-05, ADR 0052).
 *
 * Only *supplied* files are rows. The generated summary is drawn on demand
 * from the version the reader is entitled to, so it has no bytes to store, no
 * row to keep current and nothing to invalidate when the order is changed.
 *
 * One row per kind — a supplied file replaces the generated one entirely, and
 * two documents of one kind would be two answers to the same question.
 *
 * The bytes are private (ADR 0052): `fileKey` names a file in a subdirectory
 * nothing serves, read back through the API under the order's own access
 * rule. It is a random name rather than a content hash, unlike everything else
 * in the store — these are deleted when the file is replaced or the account is
 * closed, and content-addressing would have two orders sharing one file that
 * either of them could delete.
 */
export const orderDocuments = pgTable(
  'order_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('orderId')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 30 }).notNull(),
    fileKey: varchar('fileKey', { length: 128 }).notNull(),
    // The name it arrived under. Display only — nothing resolves by it — and
    // what the customer's browser saves it as.
    fileName: varchar('fileName', { length: 255 }).notNull(),
    // The *sniffed* type, never the one the uploader claimed.
    contentType: varchar('contentType', { length: 100 }).notNull(),
    byteSize: integer('byteSize').notNull(),
    suppliedAt: timestamp('suppliedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When the customer was last written to about this file, null where they
    // never were. Its own record rather than a screen's memory: whether the
    // shop has sent somebody their payment details is a fact about the order
    // that has to survive a reload, and a manager coming back to it tomorrow
    // is the person who most needs the answer.
    notifiedAt: timestamp('notifiedAt', { withTimezone: true }),
    // Null where a machine supplied it, exactly as a revision's author is:
    // this names a person, not an author in general.
    suppliedBy: uuid('suppliedBy').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Which version the order stood on when this arrived. Nothing checks a
    // supplied file against the order, so this is how staff are told the
    // total it quotes may have moved since.
    suppliedForRevision: integer('suppliedForRevision').notNull(),
  },
  (t) => [
    uniqueIndex('order_documents_order_kind_idx').on(t.orderId, t.kind),
    check('order_documents_kind_known', oneOf('kind', ORDER_DOCUMENT_KINDS)),
    check('order_documents_size_positive', sql`${t.byteSize} > 0`),
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
  // The credential behind a headless run, kept the same two ways and for the
  // same reason. A token is revoked rather than deleted, so the FK holds.
  tokenId: uuid('tokenId').references(() => apiTokens.id),
  tokenName: varchar('tokenName', { length: API_TOKEN_NAME_MAX_LENGTH }),
  stagedReason: syncStagedReason('stagedReason'),
  // Null on a run an automated client reported as broken before it produced
  // anything: no intent was ever stated and nothing was ever counted.
  options: jsonb('options').$type<SyncOptions>(),
  summary: jsonb('summary').$type<SyncSummary>(),
  rows: jsonb('rows').$type<SyncRow[]>(),
  // What the run actually did, kept once it is applied — the staged `rows` are
  // dropped at that point, and counts alone do not answer "which products
  // moved last night", which is the question the log exists for. Capped by the
  // same preview limit, so a first import stores a readable diff rather than a
  // catalog.
  plan: jsonb('plan').$type<SyncPlan>(),
  // Rows the file itself could not yield (bad price, missing/duplicate
  // sourceId). Staged with `rows` so a commit's re-diff reports the same error
  // count the preview showed — the parse happens once, at upload.
  parseErrors: jsonb('parseErrors').$type<SyncRowError[]>(),
  error: text('error'),
});

/**
 * A product document (FR-DOC-01) — a certificate, declaration or data sheet
 * staff upload once and show on many products.
 *
 * The file is a pointer, not the identity: replacing it rewrites `fileUrl` and
 * leaves the row, its title, its dates and (from the next slice) its product
 * links alone, which is how a re-issued document supersedes the one before it.
 * `fileName` is the name it was uploaded under, kept only so a row is
 * recognisable — the stored name is a content hash.
 *
 * Both dates are optional: a data sheet expires never, and an undated
 * certificate is still a document. `expiresAt` is indexed because the storefront
 * filters on it and the admin's expiry states are counted from it.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    fileUrl: text('fileUrl').notNull(),
    fileName: varchar('fileName', { length: 255 }).notNull(),
    contentType: varchar('contentType', { length: 100 }).notNull(),
    byteSize: integer('byteSize').notNull(),
    issuedAt: date('issuedAt'),
    expiresAt: date('expiresAt'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Who last touched it, for audit. Null once that account is gone.
    updatedBy: uuid('updatedBy').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [index('documents_expiresAt_idx').on(t.expiresAt)],
);

/**
 * Which products a document is shown on (FR-DOC-02). A plain join table: one
 * document is carried by many products and a product carries many documents,
 * and the link itself holds nothing — it is made from the document's side and
 * read from both.
 *
 * Both sides cascade. A deleted document takes its links with it; a product
 * row is only ever *soft*-deleted, so its links survive a delete and come back
 * with it, which is what makes the delete reversible.
 */
export const documentProducts = pgTable(
  'document_products',
  {
    documentId: uuid('documentId')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    productId: uuid('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.documentId, t.productId] }),
    // The PK answers "this document's products"; the product page and the grid
    // filter ask the other way round.
    index('document_products_productId_idx').on(t.productId),
  ],
);
