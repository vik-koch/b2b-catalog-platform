import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod';
import {
  CUSTOMER_TYPES,
  ORDER_STATUSES,
  PAGE_SLUGS,
  PAYMENT_METHODS,
  PAYMENT_STATES,
  PRODUCT_UNITS,
  TAX_BASES,
  USER_ROLES,
  USER_STATUSES,
} from '@b2b-catalog-platform/shared';

/**
 * A seed bundle: one demo shop's content as files, so the seed carries no
 * content of its own and a deployment's demo lives beside its config. Read
 * whole and strictly, like the config files — a misspelled key stops the seed
 * rather than seeding less than the author wrote.
 *
 *   catalog.json     categories, attributes, products, pairings
 *   accounts.json    the demo password, tiers, accounts and their addresses
 *   orders.json      placed orders, and the config values they snapshot
 *   documents.json   documents and the products they are shown on
 *   pages.json       page titles and consent wording
 *   pages/<slug>.html  each page's body
 */

const attribute = z.strictObject({ key: z.string(), value: z.string() });

const category = z.strictObject({
  sourceId: z.string(),
  slug: z.string(),
  name: z.string(),
  /** Parent's sourceId, or null for a top-level category. */
  parentKey: z.string().nullable(),
  /** A generated mark. False leaves the category name-only. */
  hasMark: z.boolean(),
});

const attributeDefinition = z.strictObject({
  name: z.string(),
  slug: z.string(),
  type: z.enum(['text', 'number']),
  /** Number attributes only: the unit belongs here, never in the value. */
  unit: z.string().nullable(),
});

const packaging = z.strictObject({
  piecesPerPack: z.number().int().positive().optional(),
  packsPerBox: z.number().int().positive().optional(),
  minPieceQty: z.number().int().positive().optional(),
  boxVolume: z.string().optional(),
  boxWeight: z.string().optional(),
  /** How many boxes ship; 1 for almost every product. */
  boxCount: z.number().int().positive().optional(),
});

const colour = z.string().regex(/^#[0-9a-f]{6}$/i, 'a #rrggbb colour');

/**
 * One picture. With a `url` it is a photo the seed downloads and stores like an
 * upload; without one, or when the download fails or the seed runs with
 * placeholders only, it is a generated placeholder — so a product shows the
 * same number of pictures either way.
 */
const picture = z.strictObject({
  /** The image file itself, as the library's CDN serves it. */
  url: z.url().optional(),
  /** The library page the photo is credited on. Never shown; kept for the
   * record of where it came from. */
  source: z.url().optional(),
  credit: z.string().optional(),
  /**
   * The square to keep, as fractions: `x` and `y` of the photo's width and
   * height for the top-left corner, `size` of its shorter edge. Absent: the
   * centred square.
   */
  crop: z
    .strictObject({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      size: z.number().gt(0).max(1),
    })
    .optional(),
  /** Recolours the photo, keeping its light and shade. */
  tint: colour.optional(),
});

const variant = z.strictObject({
  name: z.string(),
  /** The colour its placeholders are drawn in. A photo carries its own. */
  colour: colour.optional(),
  pictures: z.array(picture),
  /** Currently unavailable: its pictures are withheld. */
  unavailable: z.boolean().optional(),
});

const product = z.strictObject({
  sourceId: z.string(),
  slug: z.string(),
  name: z.string(),
  /** The leaf category's sourceId. */
  categoryKey: z.string(),
  /** The default list's price. */
  priceMinor: z.number().int().nonnegative(),
  descriptionHtml: z.string(),
  attributes: z.array(attribute),
  /** The gallery, in order. Empty: the product has no picture yet. */
  pictures: z.array(picture),
  /** Units of sale. Absent: sold by the piece. */
  packaging: packaging.optional(),
  /** Pieces on hand. Absent: stock is not tracked. */
  stockPieces: z.number().int().nonnegative().optional(),
  /** A tax rate of its own. Absent: the deployment's default. */
  taxRate: z.number().nonnegative().optional(),
  lineNoteEnabled: z.boolean().optional(),
  lineNotePrompt: z.string().optional(),
  /** What one piece is made of, where it is sold as a set. */
  parts: z.array(z.string()).optional(),
  /** Offered first to the main page's row. */
  featured: z.boolean().optional(),
  /** The variants an assorted article comes in, each with its own pictures
   * after the `pictures` of the whole range. */
  variants: z.array(variant).optional(),
  /** Off the storefront. Absent: published. */
  state: z.enum(['unpublished', 'deleted']).optional(),
});

const catalog = z.strictObject({
  /** Parents before their children; the order is the sort order. */
  categories: z.array(category),
  attributes: z.array(attributeDefinition),
  /** The catalogue index's filter panel, by attribute slug, in order. */
  catalogFilters: z.array(z.string()),
  products: z.array(product),
  /** Sold-together pairs, by product slug. */
  pairings: z.array(z.tuple([z.string(), z.string()])),
});

const address = z.strictObject({
  street: z.string(),
  street2: z.string().optional(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
});

const tier = z.strictObject({
  key: z.string(),
  label: z.string(),
  sortOrder: z.number().int(),
  /** What the tier takes off the default price, by category key. A category
   * without an entry is priced from the default list. */
  discounts: z.record(z.string(), z.number().min(0).max(1)),
});

const account = z.strictObject({
  /** A fixed id, for a row whose address is derived from it. */
  id: z.uuid().optional(),
  email: z.string(),
  role: z.enum(USER_ROLES),
  status: z.enum(USER_STATUSES),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  customerType: z.enum(CUSTOMER_TYPES).nullable(),
  companyRegistrationId: z.string().nullable(),
  /** The tier staff assigned, by key. */
  tier: z.string().nullable(),
  /** Saved addresses. */
  addresses: z
    .array(address.extend({ label: z.string().optional() }).strict())
    .optional(),
});

const accounts = z.strictObject({
  /** The password every account that can sign in shares. Public on purpose. */
  password: z.string(),
  tiers: z.array(tier),
  accounts: z.array(account),
  /** A contact-form consent with no account behind it. */
  inquiry: z.strictObject({ email: z.string(), phone: z.string() }),
});

const orderLine = z.strictObject({
  /** The product's sourceId. */
  sourceId: z.string(),
  unit: z.enum(PRODUCT_UNITS),
  pieces: z.number().int().positive(),
  note: z.string().optional(),
});

const isoDate = z.iso.date();

const order = z.strictObject({
  /** `{prefix}-YYMMDD-NNNN`, matching `placedOn`. The identity a re-seed skips on. */
  reference: z.string(),
  placedOn: isoDate,
  /** The account that placed it, or null for a guest order. */
  email: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  /** Absent: nothing is due. */
  paymentState: z.enum(PAYMENT_STATES).optional(),
  statusReason: z.string().optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  contactName: z.string(),
  contactEmail: z.string(),
  contactPhone: z.string(),
  partyName: z.string(),
  partyRegistrationId: z.string().nullable(),
  billing: address,
  /** A delivery address, or a pickup point's key. Exactly one. */
  delivery: address
    .extend({ zoneKey: z.string(), freeFromMinor: z.number().int() })
    .strict()
    .optional(),
  pickupKey: z.string().optional(),
  preferredDate: isoDate.optional(),
  customerNote: z.string().optional(),
  lines: z.array(orderLine).min(1),
  /** A second version, written by the shop after agreeing it. */
  adjustment: z
    .strictObject({
      note: z.string(),
      on: isoDate,
      lines: z.array(orderLine).min(1),
    })
    .optional(),
});

const orders = z.strictObject({
  /** The deployment config's values an order snapshots, written out as the
   * fixtures they are: a seeded order describes the shop it was placed in. */
  currency: z.string(),
  taxBasis: z.enum(TAX_BASES),
  defaultTaxRate: z.number().nonnegative(),
  pickupPoints: z.record(
    z.string(),
    z.strictObject({ name: z.string(), address: z.string() }),
  ),
  orders: z.array(order),
});

const document = z.strictObject({
  /** The seed's identity for a document. */
  title: z.string(),
  /** A generated placeholder file. Absent for a link-only document. */
  file: z
    .strictObject({
      fileName: z.string(),
      /** The lines printed under the title. */
      body: z.array(z.string()),
    })
    .optional(),
  link: z.string().optional(),
  issuedDaysAgo: z.number().int().nullable(),
  /** Counted from the seed run, so a long-running demo stays current. */
  expiresInDays: z.number().int().nullable(),
  categorySlugs: z.array(z.string()).optional(),
  productSlugs: z.array(z.string()).optional(),
});

const documents = z.strictObject({ documents: z.array(document) });

const pages = z.strictObject({
  pages: z.array(
    z.strictObject({
      slug: z.enum(PAGE_SLUGS),
      title: z.string(),
      /** The consent box's wording, its link in square brackets. */
      consentLabel: z.string().optional(),
    }),
  ),
});

export type ProductSeed = z.infer<typeof product>;
export type PictureSeed = z.infer<typeof picture>;
export type OrderSeed = z.infer<typeof order>;
export type OrderLineSeed = z.infer<typeof orderLine>;
export type DocumentSeed = z.infer<typeof document>;
export type AccountSeed = z.infer<typeof account>;
export type TierSeed = z.infer<typeof tier>;
export type PageSeed = z.infer<typeof pages>['pages'][number] & {
  bodyHtml: string;
};

export interface SeedBundle {
  catalog: z.infer<typeof catalog>;
  accounts: z.infer<typeof accounts>;
  orders: z.infer<typeof orders>;
  documents: DocumentSeed[];
  pages: PageSeed[];
}

/** Read and validate the bundle in `dir`. Throws naming the file that fails. */
export function loadSeedBundle(dir: string): SeedBundle {
  const read = <T>(schema: z.ZodType<T>, file: string): T => {
    const result = schema.safeParse(
      JSON.parse(readFileSync(join(dir, file), 'utf8')),
    );
    if (!result.success) {
      throw new Error(`${file}: ${z.prettifyError(result.error)}`);
    }
    return result.data;
  };
  return {
    catalog: read(catalog, 'catalog.json'),
    accounts: read(accounts, 'accounts.json'),
    orders: read(orders, 'orders.json'),
    documents: read(documents, 'documents.json').documents,
    pages: read(pages, 'pages.json').pages.map((page) => ({
      ...page,
      // The file's own final newline is the editor's, not the body's.
      bodyHtml: readFileSync(
        join(dir, 'pages', `${page.slug}.html`),
        'utf8',
      ).replace(/\n$/, ''),
    })),
  };
}

/** One page of a bundle. Throws if the bundle has none by that slug. */
export function pageSeed(bundle: SeedBundle, slug: PageSeed['slug']): PageSeed {
  const page = bundle.pages.find((candidate) => candidate.slug === slug);
  if (!page) throw new Error(`The seed bundle has no ${slug} page`);
  return page;
}
