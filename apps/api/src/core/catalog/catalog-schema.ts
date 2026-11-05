import { sql } from 'drizzle-orm';
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
import { users } from '../accounts/accounts-schema';
import { PRODUCT_AVAILABILITIES } from '@b2b-catalog-platform/shared/core/catalog';

/**
 * Postgres `tsvector`, which drizzle has no built-in type for. Only ever
 * written by the database (generated column) and read by the index, so the
 * TypeScript side is a plain string and no parsing is needed.
 */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * Catalog categories, an adjacency-list tree. Structure (name, hierarchy) is
 * file-owned — derived from the import's category paths and keyed by
 * `sourceId` — while `sortOrder`, `mark` and `shortName` are
 * admin overlay that survives a re-sync. `slug` is the public URL handle, generated once and
 * kept stable.
 */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The sync identity, derived from the file's category path. Unique + private.
  // Null for a category the shop invented: no source system knows it, and
  // nothing but the exchange needs a key — which is what leaves such a
  // category's name the shop's to change while the catalog is externally
  // owned. Postgres allows many nulls under a unique constraint.
  sourceId: varchar('sourceId', { length: 512 }).unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  parentId: uuid('parentId').references((): AnyPgColumn => categories.id, {
    onDelete: 'set null',
  }),
  // Overlay fields — admin-owned, never touched by the import.
  sortOrder: integer('sortOrder').notNull().default(0),
  // A small square mark (logo) drawn beside the name wherever the category is
  // shown. A full + thumb media-store pair; its URLs must be covered by the
  // media-prune reference scan.
  mark: jsonb('mark').$type<ProductImageRef>(),
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
 * `variantId` is the variant it shows (FR-CAT-11); absent on every picture
 * stored before variants existed, which reads as showing none.
 */
export type ProductImageRef = {
  full: string;
  thumb: string;
  variantId?: string | null;
};

/** One of a product's variants (FR-CAT-11/12), in the storefront's order. */
export type ProductVariantRef = {
  id: string;
  name: string;
  unavailable: boolean;
};

/** The three states a stock figure resolves to (FR-STOCK-02). */
export const productAvailabilityEnum = pgEnum('product_availability', [
  ...PRODUCT_AVAILABILITIES,
]);

/**
 * Catalog products. `sourceId` (the legacy system's private id) is the sync
 * upsert key and is never serialized to the API. `name`, the prices (see
 * product_prices) and `categoryId` are file-owned; `descriptionHtml`, the
 * attributes (see product_attributes), the images and their variants are admin
 * overlay that a re-sync leaves untouched.
 * Missing-from-source rows are soft-deleted via `deletedAt`, never removed.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: varchar('sourceId', { length: 255 }).notNull().unique(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 512 }).notNull(),
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
    // The tax rate this product is charged at, where it is not the
    // deployment's default (NFR-LEGAL-11). A percent, and never multiplied by
    // anything: the platform states a rate, the shop's invoice works out the
    // tax. Owned like the price. Null is the default; under a basis that
    // charges no tax it is kept but is not in effect.
    taxRate: numeric('taxRate', { precision: 5, scale: 2, mode: 'number' }),
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
    // The parts one piece is made of, where it is sold as a set (FR-CAT-10):
    // none, or two to three short words. Admin-owned like the note above; it
    // marks the product and qualifies its attributes, and sells nothing.
    parts: text('parts')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Offered first to the main page's row (FR-CAT-09). Admin-owned like the
    // parts above: no exchange sets or clears it.
    featured: boolean('featured').notNull().default(false),
    // Ordered gallery, each with a full and a thumb media-store URL. The
    // media-prune reference scan must include these URLs (and categories.mark)
    // so seeded/uploaded images are not swept.
    images: jsonb('images')
      .$type<ProductImageRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // The variants the pictures above show (FR-CAT-11). Admin-owned like the
    // images: no exchange reads or writes them, however the catalog is owned.
    variants: jsonb('variants')
      .$type<ProductVariantRef[]>()
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
      'products_tax_rate_percent',
      sql`${t.taxRate} is null or ${t.taxRate} between 0 and 100`,
    ),
    check(
      'products_units_positive',
      sql`${t.minPieceQty} >= 1
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
    // Which of the product's parts the row describes — "Colour (cup)" is
    // stored as key "Colour", part "cup", so it filters as Colour. Null for a
    // row about the whole product.
    part: varchar('part', { length: 40 }),
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
 * The filter panel of the whole-catalogue listing (FR-ATTR-12) — the rows of
 * `category_attributes` for the one listing that is no category.
 *
 * Kept apart rather than stored as a category row with no category, because
 * it is **not an ancestor**: nothing inherits it, and a category with no
 * overlay still offers the registry. And it is **opt-in** — no row, no
 * filter — since the whole catalogue carries every attribute there is, and
 * the few worth filtering across categories (a brand) are a choice.
 */
export const catalogAttributes = pgTable('catalog_attributes', {
  attributeId: uuid('attributeId')
    .primaryKey()
    .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
  /** Where the attribute sits in the panel. */
  sortOrder: integer('sortOrder').notNull(),
  /** Kept rather than deleted, so an unticked row keeps its place. */
  hidden: boolean('hidden').notNull().default(false),
});

/**
 * The customer tiers of FR-AUTH-05 — price lists as rows rather than a
 * code-level enum, because tier names are a deployment's own commercial
 * vocabulary and adding one must not be a release.
 *
 * Tiers are **unordered**. They are distinct customer kinds (wholesale,
 * partner, …), not steps on a scale, so nothing ranks them and none inherits
 * from another.
 *
 * Exactly one row carries `isDefault`: the list served to guests, crawlers,
 * staff, and every account without a `tierId`. It is an ordinary tier in every
 * other respect — it is renamed, rekeyed and priced like the rest — and the
 * badge is the only thing that distinguishes it. A price therefore belongs to a
 * (product, price list) pair and to nothing else; see product_prices.
 *
 * `key` is the stable machine identifier the bulk import addresses a price list
 * by (`price:<key>` columns); `label` is what staff see. No key is reserved:
 * which list guests see is the badge's answer, not a name's.
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
    /**
     * The list guests and untiered accounts are charged, and the one a product
     * must be priced in to be published. Presentation, not pricing mechanics:
     * an external catalog owner writes prices, never which list is the shop's
     * own front price.
     */
    isDefault: boolean('isDefault').notNull().default(false),
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
  (t) => [
    // At most one default, enforced by the database rather than by whoever
    // happens to write next. The other half of the rule — at least one — is a
    // delete refusal: no index can require a row to exist.
    uniqueIndex('customer_tiers_one_default_idx')
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

/**
 * A product's price in one price list. Every price lives here, the default
 * list's included: a price is an attribute of a (product, tier) pair, so baking
 * one list into a column would make that list secretly the (N+1)th and give
 * every pricing rule two implementations.
 *
 * A tier with no row for a product falls back to the default tier's price,
 * which is what lets a tier carry only its exceptions; since tiers are
 * unordered, that fallback is always to the default list, never to some
 * neighbouring tier. A product with no default-list row has no price at all —
 * a legitimate state (a source system that exports products and prices
 * separately), and the one thing publication refuses.
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
    // A price is a positive amount of money. "Not priced" is the absence of
    // this row and has no other spelling: a zero would be a second one, read
    // by every screen as a product given away. Negative was never meaningful.
    check('product_prices_price_positive', sql`${t.priceMinor} > 0`),
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
 * A document is a file, a link to where it is held elsewhere — a register
 * entry, the issuer's page — or both (FR-DOC-05).
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
    // The file is all four columns or none of them (FR-DOC-05).
    fileUrl: text('fileUrl'),
    fileName: varchar('fileName', { length: 255 }),
    contentType: varchar('contentType', { length: 100 }),
    byteSize: integer('byteSize'),
    // Where the document is held outside the shop, e.g. a register entry.
    link: text('link'),
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
  (t) => [
    index('documents_expiresAt_idx').on(t.expiresAt),
    check(
      'documents_file_whole',
      sql`(${t.fileUrl} is null) = (${t.fileName} is null)
        and (${t.fileUrl} is null) = (${t.contentType} is null)
        and (${t.fileUrl} is null) = (${t.byteSize} is null)`,
    ),
    // A document nobody can open is not a document.
    check(
      'documents_file_or_link',
      sql`${t.fileUrl} is not null or ${t.link} is not null`,
    ),
  ],
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
