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
import { identities } from '../../platform/db/schema';
import { PRODUCT_AVAILABILITIES } from '@b2b-catalog-platform/shared/core/catalog';

/** Postgres `tsvector`, which drizzle lacks. Written only by the database and
 * read only by the index, so a plain string is enough. */
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => 'tsvector',
});

/**
 * An adjacency-list tree. Name and parent come from the import's category
 * paths; `sortOrder`, `mark` and `shortName` are the admin's and survive a
 * sync. `slug` is generated once and kept.
 */
export const categories = pgTable('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** The sync key, from the file's category path; never public. Null for a
   * category the shop made: only the exchange needs a key, so its name stays
   * the shop's while the catalog is owned. */
  sourceId: varchar('sourceId', { length: 512 }).unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  parentId: uuid('parentId').references((): AnyPgColumn => categories.id, {
    onDelete: 'set null',
  }),
  sortOrder: integer('sortOrder').notNull().default(0),
  /** A small square logo beside the name. Its URLs must be in the media
   * prune's sources, or the sweep deletes them. */
  mark: jsonb('mark').$type<ProductImageRef>(),
  /** The name where the parent is already shown (tiles, chips, breadcrumbs):
   * "Arabica" under "Coffee Beans". Null uses `name`. */
  shortName: varchar('shortName', { length: 255 }),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** Who last edited the admin's fields. Null for a row only a sync wrote. */
  updatedBy: uuid('updatedBy').references(() => identities.id, {
    onDelete: 'set null',
  }),
});

/**
 * One gallery picture: `thumb` for listings and search, `full` for the
 * product page. No alt text: the UI uses the product name. Order is the array
 * order. An absent `variantId` shows no variant (FR-CAT-11).
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
 * `sourceId` is the sync key and never leaves the API. Name, prices and
 * category come from the source; description, attributes, pictures and
 * variants are the admin's and survive a sync. A product the source drops is
 * soft-deleted, never removed.
 */
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceId: varchar('sourceId', { length: 255 }).notNull().unique(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    name: varchar('name', { length: 512 }).notNull(),
    /** Null: not sold by the pack. The admin's; no sync carries packaging. */
    piecesPerPack: integer('piecesPerPack'),
    packsPerBox: integer('packsPerBox'),
    /** Where piece quantities start, not their step: the step is a pack, or
     * one where the minimum is under a pack (`pieceStep`). */
    minPieceQty: integer('minPieceQty').notNull().default(1),
    /** Shipping dimensions of a box. Plain numerics: integer money is about
     * rounding currency, not mass. Unit labels are deployment config. */
    boxVolume: numeric('boxVolume', { precision: 12, scale: 3 }),
    boxWeight: numeric('boxWeight', { precision: 12, scale: 3 }),
    /** Shown only above 1. Multiplies nothing: volume and weight already
     * describe the whole consignment. */
    boxCount: integer('boxCount').notNull().default(1),
    /** Pieces on hand (FR-STOCK-01), never sent to a customer. Null: stock is
     * not tracked, so no badge and no limit. Negative reads as none. */
    stockPieces: integer('stockPieces'),
    /** Where "few left" sits, in place of the box, pack and config ladder. */
    lowStockThresholdPieces: integer('lowStockThresholdPieces'),
    /** A percent where it is not the shop's default (NFR-LEGAL-11). Stated,
     * never applied: the invoice works the tax out. Kept, unused, under a basis
     * that charges no tax. */
    taxRate: numeric('taxRate', { precision: 5, scale: 2, mode: 'number' }),
    /** The public face of stock, recomputed by every write to stock,
     * threshold or packaging (FR-STOCK-02). Stored so a sort can lead with it
     * on an index. Null wherever `stockPieces` is. */
    availability: productAvailabilityEnum('availability'),
    categoryId: uuid('categoryId')
      .notNull()
      .references(() => categories.id, { onDelete: 'restrict' }),
    descriptionHtml: text('descriptionHtml').notNull().default(''),
    /** Whether a cart line may carry a note, for a collective item whose
     * variants are not separate articles. */
    lineNoteEnabled: boolean('lineNoteEnabled').notNull().default(false),
    /** What the note asks for ("state the colour"). Null uses the shop-wide
     * wording. */
    lineNotePrompt: varchar('lineNotePrompt', { length: 200 }),
    /** The parts of a piece sold as a set (FR-CAT-10): none, or two to three
     * short words. They qualify attributes and sell nothing. */
    parts: text('parts')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Offered first to the main page's row (FR-CAT-09). */
    featured: boolean('featured').notNull().default(false),
    /** Its URLs must be in the media prune's sources, or the sweep deletes
     * them. */
    images: jsonb('images')
      .$type<ProductImageRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** The variants the pictures show (FR-CAT-11). No exchange touches them,
     * whoever owns the catalog. */
    variants: jsonb('variants')
      .$type<ProductVariantRef[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    deletedAt: timestamp('deletedAt', { withTimezone: true }),
    /** Null until an admin publishes; independent of `deletedAt`. A sync
     * never sets it, so a new product waits until somebody checked its
     * price. */
    publishedAt: timestamp('publishedAt', { withTimezone: true }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updatedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** Apart from `updatedBy`: a delete is soft, so who hid a product stays
     * answerable. */
    deletedBy: uuid('deletedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** Who took responsibility for the price going public. */
    publishedBy: uuid('publishedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** The name's search index (FR-SEARCH-02), kept by the database so no
     * write can leave it stale. Never selected, which is why every products
     * query lists its columns. */
    nameTsv: tsvector('nameTsv').generatedAlwaysAs(
      sql`to_tsvector('simple', search_unaccent("name"))`,
    ),
  },
  (t) => [
    // Availability leads every listing's sort (FR-STOCK-05).
    index('products_availability_idx').on(t.availability),
    index('products_nameTsv_idx').using('gin', t.nameTsv),
    // The trigram half of the score. An expression index: the query must
    // spell the unaccent wrapper exactly like this to use it.
    index('products_name_trgm_idx').using(
      'gin',
      sql`search_unaccent("name") gin_trgm_ops`,
    ),
    // Both or neither, so a recompute that forgets one fails here instead of
    // showing a wrong badge.
    check(
      'products_availability_tracks_stock',
      sql`(${t.stockPieces} is null) = (${t.availability} is null)`,
    ),
    // A threshold needs a counted stock, and one at or below zero is "out",
    // which the state already says.
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
    // A box holds piecesPerPack * packsPerBox pieces.
    check(
      'products_box_needs_pack',
      sql`${t.packsPerBox} is null or ${t.piecesPerPack} is not null`,
    ),
    check(
      'products_box_count_needs_box',
      sql`${t.boxCount} = 1 or ${t.packsPerBox} is not null`,
    ),
    check(
      'products_line_note_prompt_needs_note',
      sql`${t.lineNotePrompt} is null or ${t.lineNoteEnabled}`,
    ),
    // Under one pack, or whole packs. A minimum of 8 against a pack of 6
    // starts off every lattice, and no single lot price describes every total.
    check(
      'products_minimum_fits_packs',
      sql`${t.piecesPerPack} is null
        or ${t.minPieceQty} < ${t.piecesPerPack}
        or ${t.minPieceQty} % ${t.piecesPerPack} = 0`,
    ),
  ],
);

/**
 * A product's free-text characteristics. Rows rather than jsonb, so a value
 * can be filtered and counted without unpacking every product.
 *
 * `key` matches `attribute_definitions.name` as text, never a foreign key, so
 * a definition changes without touching a product. `valueNumeric` is parsed
 * whenever `value` reads as a number, whatever the definitions say.
 *
 * `sortOrder` is the grid's row order: every read sorts by it. A save
 * replaces the rows wholesale.
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
    /** The part the row describes: "Colour (cup)" is key "Colour", part
     * "cup", so it filters as Colour. Null for the whole product. */
    part: varchar('part', { length: 40 }),
    valueNumeric: numeric('valueNumeric', { precision: 18, scale: 6 }),
  },
  (t) => [
    // The read order as well as the identity: one row per grid line.
    primaryKey({ columns: [t.productId, t.sortOrder] }),
    // Facet counts and the attribute inventory both lead with the key.
    index('product_attributes_key_value_idx').on(t.key, t.value),
  ],
);

/** Text sorts as text, a number numerically; nothing else is needed. */
export const attributeType = pgEnum('attribute_type', ['text', 'number']);

/**
 * The attributes worth filtering by (FR-ATTR-01): a registry, not a schema. A
 * definition constrains no product and holds no values; `name` matches
 * `product_attributes.key` exactly, so one added today covers products entered
 * months ago.
 *
 * `slug` is what a filtered listing's URL holds, so a rename keeps links.
 * `unit` is a display suffix kept here, never in a value, or "30 cm" and
 * "30cm" become two facets.
 */
export const attributeDefinitions = pgTable('attribute_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 200 }).notNull().unique(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  type: attributeType('type').notNull().default('text'),
  unit: varchar('unit', { length: 32 }),
  /** Where the attribute sits in the filter panel. */
  sortOrder: integer('sortOrder').notNull().default(0),
  createdAt: timestamp('createdAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedBy: uuid('updatedBy').references(() => identities.id, {
    onDelete: 'set null',
  }),
});

/**
 * A category's own filter panel (FR-ATTR-11), as deviations. Without rows a
 * category offers every definition its products carry, in the registry's
 * order; with rows it offers exactly those; and one with none inherits the
 * nearest ancestor's, so "Coffee" covers its subcategories.
 *
 * An attribute defined after the rows were saved is in none of them, so it is
 * not offered there until somebody adds it; the editor lists it unticked.
 * Rows are written wholesale on save.
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
    sortOrder: integer('sortOrder').notNull(),
    /** Kept rather than deleted, so the row keeps its place. */
    hidden: boolean('hidden').notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.categoryId, t.attributeId] })],
);

/**
 * The filter panel of the whole-catalogue listing (FR-ATTR-12). Not a
 * category row: nothing inherits it. And opt-in, no row no filter, since the
 * whole catalogue carries every attribute and the few worth filtering across
 * categories (a brand) are a choice.
 */
export const catalogAttributes = pgTable('catalog_attributes', {
  attributeId: uuid('attributeId')
    .primaryKey()
    .references(() => attributeDefinitions.id, { onDelete: 'cascade' }),
  sortOrder: integer('sortOrder').notNull(),
  /** Kept rather than deleted, so an unticked row keeps its place. */
  hidden: boolean('hidden').notNull().default(false),
});

/**
 * The price lists (FR-AUTH-05), as rows because their names are a shop's own
 * vocabulary and a new one must not need a release. Unordered: distinct kinds
 * of customer, not steps, so none ranks above or inherits from another.
 *
 * Exactly one carries `isDefault`: the list for guests, crawlers, staff and
 * every account without a `tierId`. Otherwise it is a tier like any other, so
 * a price belongs to a (product, list) pair and nothing else.
 *
 * `key` is what an import addresses (`price:<key>` columns); `label` is what
 * staff see. No key is reserved: the badge says which list guests see.
 */
export const customerTiers = pgTable(
  'customer_tiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    key: varchar('key', { length: 64 }).notNull().unique(),
    label: varchar('label', { length: 255 }).notNull(),
    /** The order of staff screens only, so the list edited most comes first.
     * Nothing resolves a price by position. */
    sortOrder: integer('sortOrder').notNull().default(0),
    /** The list guests and untiered accounts pay, and the one a product needs
     * a price in to be published. An external catalog owner writes prices,
     * never this. */
    isDefault: boolean('isDefault').notNull().default(false),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updatedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    // At most one default. At least one is the delete refusal's job: no index
    // can require a row.
    uniqueIndex('customer_tiers_one_default_idx')
      .on(t.isDefault)
      .where(sql`${t.isDefault}`),
  ],
);

/**
 * A product's price in one list, the default list's included: a column for
 * one list would make it a hidden extra tier and every pricing rule double.
 *
 * A list without a row for a product falls back to the default list's price,
 * so a list carries only its exceptions. A product without a default-list row
 * has no price, a legitimate state that only publication refuses.
 *
 * `tierId` restricts: dropping a list would silently re-price its products.
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
    // The key serves product-first lookups; this the tier-first ones (the
    // delete guard, the per-list views).
    index('product_prices_tierId_idx').on(t.tierId),
    // "Not priced" is the missing row and has no other spelling: every screen
    // would read a zero as a product given away.
    check('product_prices_price_positive', sql`${t.priceMinor} > 0`),
  ],
);

/**
 * Products sold together (FR-SET-01), one row per pair: the smaller id is
 * always A, whichever product was edited, and no product pairs with itself.
 *
 * Cascades both ways, as an edge to a removed product is no pairing. A
 * soft-deleted product keeps its edges: the delete is reversible, and clearing
 * them would rewrite the other product's set from a screen nobody opened.
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
    // Every read is one product asking from both sides; the key covers A.
    index('product_pairings_productBId_idx').on(t.productBId),
    check(
      'product_pairings_canonical_order',
      sql`${t.productAId} < ${t.productBId}`,
    ),
  ],
);

/**
 * A certificate, declaration or data sheet uploaded once and shown on many
 * products (FR-DOC-01). The file is a pointer, not the identity: replacing it
 * rewrites `fileUrl` and keeps the row and its links, which is how a reissue
 * supersedes the old one. `fileName` is the uploaded name, kept to recognise
 * the row; the stored name is a hash.
 *
 * A file, a link to where it is held elsewhere, or both (FR-DOC-05). Both
 * dates are optional; `expiresAt` is indexed for the storefront's filter and
 * the admin's expiry counts.
 */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: varchar('title', { length: 200 }).notNull(),
    /** The file is all four columns or none of them (FR-DOC-05). */
    fileUrl: text('fileUrl'),
    fileName: varchar('fileName', { length: 255 }),
    contentType: varchar('contentType', { length: 100 }),
    byteSize: integer('byteSize'),
    /** Where it is held outside the shop, such as a register entry. */
    link: text('link'),
    issuedAt: date('issuedAt'),
    expiresAt: date('expiresAt'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedBy: uuid('updatedBy').references(() => identities.id, {
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
    // A document nobody can open is no document.
    check(
      'documents_file_or_link',
      sql`${t.fileUrl} is not null or ${t.link} is not null`,
    ),
  ],
);

/**
 * Which products a document is shown on (FR-DOC-02). Cascades both ways: a
 * product is only ever soft-deleted, so its links come back with it.
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
    // The key answers a document's products; the product page and the grid
    // filter ask the other way.
    index('document_products_productId_idx').on(t.productId),
  ],
);
