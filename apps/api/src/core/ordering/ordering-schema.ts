import { sql } from 'drizzle-orm';
import {
  FULFILMENT_METHODS,
  ORDER_ADJUSTMENT_NOTE_MAX,
  ORDER_WRITE_ACTOR_MAX,
  ORDER_DOCUMENT_KINDS,
  ORDER_REVISION_KINDS,
  ORDER_STATUS_REASON_MAX,
  ORDER_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATES,
} from '@b2b-catalog-platform/shared/core/ordering';
import { PRODUCT_UNITS } from '@b2b-catalog-platform/shared/core/catalog';
import { TAX_BASES } from '@b2b-catalog-platform/shared/platform';
import {
  AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { oneOf } from '../../platform/db/sql-columns';
import { users } from '../accounts/accounts-schema';
import { identities } from '../../platform/db/schema';
import { products } from '../catalog/catalog-schema';
import { pageVersions } from '../site/site-schema';

/**
 * An order request (FR-CART-03): priced, recorded and mailed, and confirmed
 * by a manager. This row is the identity and the workflow: its number, link,
 * owner, state and what it owes. What the order says lives on
 * `order_revisions`, as an adjustment writes a new version (FR-ORD-03).
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Quoted on the phone, in the deployment's format (dated, partly random,
     * so no mail shows the daily volume). It survives every adjustment, which
     * is why adjustments are versions. */
    reference: varchar('reference', { length: 32 }).notNull().unique(),
    /** The only credential of a mailed link (FR-NOTIF-06): a guest has no
     * account to read the order through. */
    publicToken: varchar('publicToken', { length: 64 }).notNull().unique(),
    /** Null for a guest. Never `set null`: an account is anonymized, not
     * deleted, so this link survives. */
    userId: uuid('userId').references(() => users.id, {
      onDelete: 'no action',
    }),
    /** The version every view shows, so one read answers it. Nullable only
     * because the first revision is written a statement after the order, in
     * the same transaction. */
    currentRevisionId: uuid('currentRevisionId').references(
      (): AnyPgColumn => orderRevisions.id,
      { onDelete: 'no action' },
    ),
    /** The version the customer sees, the last one they were told about
     * (FR-NOTIF-03). It stops when the order ends, so staff correcting a
     * finished order mail nobody; moving it on is its own button. */
    customerRevisionId: uuid('customerRevisionId').references(
      (): AnyPgColumn => orderRevisions.id,
      { onDelete: 'no action' },
    ),
    /** Where the order stands now, for the staff list's filters, sort and
     * counts. A reader is shown the status of the version they look at. */
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    /** The latest move only: the revisions are the history, and this is what
     * a list asks without reading them. */
    statusChangedAt: timestamp('statusChangedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    statusChangedBy: uuid('statusChangedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** Whether the money has arrived (FR-ORD-04), beside the status rather
     * than a step in it: cash is paid after handover. Starts `not-due`;
     * acceptance moves invoiced methods to `awaiting`. */
    paymentState: varchar('paymentState', { length: 20 })
      .notNull()
      .default('not-due'),
    /** The record that the money was received, and who said so. */
    paidAt: timestamp('paidAt', { withTimezone: true }),
    paidBy: uuid('paidBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** The terms accepted on submission (NFR-LEGAL-10), on the order since no
     * adjustment accepts them again. Null where the shop publishes none or
     * published none yet. */
    termsVersionId: uuid('termsVersionId').references(() => pageVersions.id, {
      onDelete: 'restrict',
    }),
    /** The tax basis at submission (NFR-LEGAL-11). A shop that becomes liable
     * while the order is open does not turn its quoted prices into net ones. */
    taxBasis: varchar('taxBasis', { length: 16 }).notNull(),
    /** When every version's personal details were removed (NFR-LEGAL-14): the
     * account went, retention ran out or a guest asked. The sweep reads it so
     * no order is cleared, and recorded, twice. */
    personalDataRemovedAt: timestamp('personalDataRemovedAt', {
      withTimezone: true,
    }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When anything last happened to the order. A column, set by every write
     * to it, because the outbound read sorts and pages by it (FR-ADM-08) and a
     * sort over an expression across tables is neither indexed nor stable. */
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('orders_userId_idx').on(t.userId),
    index('orders_createdAt_idx').on(t.createdAt),
    // The outbound read's order: the index for the sort serves the cursor's
    // seek as well.
    index('orders_updatedAt_idx').on(t.updatedAt, t.id),
    check('orders_status_known', oneOf('status', ORDER_STATUSES)),
    check('orders_tax_basis_known', oneOf('taxBasis', TAX_BASES)),
    check('orders_payment_state_known', oneOf('paymentState', PAYMENT_STATES)),
    // A paid order says when; an unpaid one cannot.
    check(
      'orders_paid_recorded',
      sql`(${t.paymentState} = 'paid') = (${t.paidAt} is not null)`,
    ),
  ],
);

/**
 * What an order says as of one version (FR-ORD-03). Submission writes 1, and
 * every move and adjustment the next. Old versions are kept and staff can read
 * them: they are the order's history, and what an earlier document says it
 * came from.
 *
 * A version is complete, status included, so the customer can be shown one
 * the order has moved past. Nearly all of it is a copy of things editable
 * elsewhere: addresses, contacts, pickup office, currency. Which book row an
 * address came from is not kept; that row can change or go.
 */
export const orderRevisions = pgTable(
  'order_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orderId: uuid('orderId')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    /** 1 is the submission. Unique per order, so two managers adjusting at
     * once cannot write the same version. */
    revisionNumber: integer('revisionNumber').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** A person: null on the customer's submission and on a write-back. */
    createdBy: uuid('createdBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** Who wrote it from outside (FR-ADM-08): the owning system's name for
     * them, or the credential's. A label, never a reference: matching another
     * system's user to an account here could credit the wrong person. Null is
     * the answer to "the exchange did not write this". */
    source: varchar('source', { length: ORDER_WRITE_ACTOR_MAX }),
    /** Submission, a move or a change to the content. Stored, so nobody diffs
     * two rows to learn why one exists, and the customer's mail knows whether
     * the order itself changed. */
    kind: varchar('kind', { length: 20 }).notNull().default('adjustment'),
    /** Where the order stood as of this version (FR-ORD-01). */
    status: varchar('status', { length: 20 }).notNull().default('requested'),
    /** Why it was declined or called off (FR-ORD-02); null otherwise, as a
     * blank would be a reason a mail quotes as nothing. */
    statusReason: varchar('statusReason', { length: ORDER_STATUS_REASON_MAX }),
    /** What the manager says changed in this version; the customer's mail
     * quotes it. */
    note: varchar('note', { length: ORDER_ADJUSTMENT_NOTE_MAX }),
    /** When the customer was written to about this version (FR-NOTIF-03).
     * Stamped, as staff need to see which versions the customer was told
     * about, which the shown version cannot say. */
    notifiedAt: timestamp('notifiedAt', { withTimezone: true }),
    /** Asked on the form, not read off the account: a guest has none, and a
     * colleague may take the call. */
    contactName: varchar('contactName', { length: 200 }).notNull(),
    contactEmail: varchar('contactEmail', { length: 255 }).notNull(),
    contactPhone: varchar('contactPhone', { length: 50 }).notNull(),
    paymentMethod: varchar('paymentMethod', { length: 20 }).notNull(),
    fulfilmentMethod: varchar('fulfilmentMethod', { length: 20 }).notNull(),
    /** The invoiced party (FR-CART-09): the account's own, or whoever the
     * customer named. */
    partyName: varchar('partyName', { length: 255 }).notNull(),
    /** Null for a person; a company always has one, in the shape of
     * `users.companyRegistrationId`. */
    partyRegistrationId: varchar('partyRegistrationId', { length: 64 }),
    /** Null where the shop invoices no address of its own
     * (`billingAddressEnabled`): a blank street is one somebody could print. */
    billingStreet: varchar('billingStreet', { length: 255 }),
    billingStreet2: varchar('billingStreet2', { length: 255 }),
    billingPostalCode: varchar('billingPostalCode', { length: 32 }),
    billingCity: varchar('billingCity', { length: 255 }),
    billingRegion: varchar('billingRegion', { length: 255 }),
    billingCountry: varchar('billingCountry', { length: 2 }),
    /** Null for a pickup. */
    deliveryStreet: varchar('deliveryStreet', { length: 255 }),
    deliveryStreet2: varchar('deliveryStreet2', { length: 255 }),
    deliveryPostalCode: varchar('deliveryPostalCode', { length: 32 }),
    deliveryCity: varchar('deliveryCity', { length: 255 }),
    deliveryRegion: varchar('deliveryRegion', { length: 255 }),
    deliveryCountry: varchar('deliveryCountry', { length: 2 }),
    /** The zone the postal code matched and the free-delivery threshold it
     * promised: advice only, it neither blocked nor priced anything
     * (FR-CART-07). Copied, as the config changes. */
    deliveryZoneKey: varchar('deliveryZoneKey', { length: 64 }),
    deliveryFreeFromMinor: integer('deliveryFreeFromMinor'),
    pickupLocationKey: varchar('pickupLocationKey', { length: 64 }),
    pickupLocationName: varchar('pickupLocationName', { length: 255 }),
    pickupLocationAddress: text('pickupLocationAddress'),
    /** The day the customer wishes for; the date itself is agreed by phone or
     * mail (FR-CART-07). An adjustment carries it over: a manager overwriting
     * it would answer for the customer. */
    preferredDate: date('preferredDate'),
    customerNote: text('customerNote'),
    totalMinor: integer('totalMinor').notNull(),
    /** The shipment estimate as shown (FR-UNIT-11), copied because packaging
     * changes. Approximate where a line fills no whole box;
     * `shipmentUncoveredLines` counts lines with no box at all. */
    shipmentCartons: integer('shipmentCartons').notNull().default(0),
    shipmentVolume: numeric('shipmentVolume', { precision: 12, scale: 3 }),
    shipmentWeight: numeric('shipmentWeight', { precision: 12, scale: 3 }),
    shipmentApproximate: boolean('shipmentApproximate')
      .notNull()
      .default(false),
    shipmentUncoveredLines: integer('shipmentUncoveredLines')
      .notNull()
      .default(0),
    /** The shop's currency can change under an old order. */
    currency: varchar('currency', { length: 8 }).notNull(),
    /** The price list it was priced from; null is the default list. Never
     * shown to the customer, and cleared by anonymization like
     * `users.tierId`. A re-price from another list (FR-CART-09) is a version
     * that says so. */
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
    // A delivery has an address and no office, a pickup the reverse.
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
 * An ordered line, frozen: linked to its product by id and described by a
 * copy, so a rename, a new price or a delete rewrites nothing ordered, and the
 * read falls back to text where the product is gone from view.
 *
 * `priceMinor` is per piece, so the total is one exact multiplication. Prices
 * per pack or box are derived when shown.
 */
export const orderItems = pgTable(
  'order_items',
  {
    /** The version, not the order: an adjusted order keeps its submitted
     * lines on the version that carried them. */
    revisionId: uuid('revisionId')
      .notNull()
      .references(() => orderRevisions.id, { onDelete: 'cascade' }),
    sortOrder: integer('sortOrder').notNull(),
    /** Restricts: a line must never lose its product. */
    productId: uuid('productId')
      .notNull()
      .references(() => products.id, { onDelete: 'restrict' }),
    /** For staff and the source system only, like `products.sourceId`. */
    productSourceId: varchar('productSourceId', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull(),
    name: varchar('name', { length: 512 }).notNull(),
    /** The thumb URL. It must be in the media prune's sources, or the sweep
     * deletes it. */
    thumbnail: text('thumbnail'),
    /** The unit the line was bought in, and `quantity` the reading of
     * `pieces` in it, frozen: an order still says "0.2 bx" after a repack.
     * `pieces` is the quantity; nothing is derived from the reading. */
    unit: varchar('unit', { length: 10 }).notNull(),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'number',
    }).notNull(),
    pieces: integer('pieces').notNull(),
    /** The price of one piece in the order's list, as it stood. */
    priceMinor: integer('priceMinor').notNull(),
    /** The rate when the version was written (NFR-LEGAL-11); null under a
     * basis that charges no tax. Stated, never multiplied. */
    taxRate: numeric('taxRate', { precision: 5, scale: 2, mode: 'number' }),
    lineTotalMinor: integer('lineTotalMinor').notNull(),
    /** Typed by the customer, so anonymization scrubs it: it may well read
     * "deliver to Anna, 0170…". */
    note: varchar('note', { length: 500 }),
  },
  (t) => [
    // The read order as well as the identity.
    primaryKey({ columns: [t.revisionId, t.sortOrder] }),
    check('order_items_unit_known', oneOf('unit', PRODUCT_UNITS)),
    check(
      'order_items_tax_rate_percent',
      sql`${t.taxRate} is null or ${t.taxRate} between 0 and 100`,
    ),
    check(
      'order_items_quantities_positive',
      // Two packs read as boxes are 0.2 of one.
      sql`${t.quantity} > 0 and ${t.pieces} >= 1`,
    ),
    // Whole pieces times a price, nothing rounded.
    check(
      'order_items_total_exact',
      sql`${t.lineTotalMinor} = ${t.priceMinor} * ${t.pieces}`,
    ),
  ],
);

/**
 * A file supplied for an order (FR-ORD-05). The generated summary is no row:
 * it is drawn on demand from the version the reader may see, so nothing goes
 * stale. One per kind, as a supplied file replaces the generated one.
 *
 * Private: `fileKey` names a file nothing serves, read through the API under
 * the order's access rule. Random, not a content hash: the file is deleted
 * with a replacement or an erasure, and a shared hash would let one order
 * delete another's file.
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
    /** The name it arrived under, which the customer's browser saves it as. */
    fileName: varchar('fileName', { length: 255 }).notNull(),
    /** Sniffed, never the uploader's claim. */
    contentType: varchar('contentType', { length: 100 }).notNull(),
    byteSize: integer('byteSize').notNull(),
    suppliedAt: timestamp('suppliedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the customer was last written to about the file. Stored: whether
     * somebody has their payment details must survive a reload. */
    notifiedAt: timestamp('notifiedAt', { withTimezone: true }),
    /** A person: null where a machine supplied it. */
    suppliedBy: uuid('suppliedBy').references(() => identities.id, {
      onDelete: 'set null',
    }),
    /** The version the order stood on when it arrived. Nothing checks a file
     * against the order, so staff learn its total may have moved. */
    suppliedForRevision: integer('suppliedForRevision').notNull(),
  },
  (t) => [
    uniqueIndex('order_documents_order_kind_idx').on(t.orderId, t.kind),
    check('order_documents_kind_known', oneOf('kind', ORDER_DOCUMENT_KINDS)),
    check('order_documents_size_positive', sql`${t.byteSize} > 0`),
  ],
);
