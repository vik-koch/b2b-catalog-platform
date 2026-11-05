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
import { products } from '../catalog/catalog-schema';
import { pageVersions } from '../site/site-schema';

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
    // The terms the order accepted on submission (NFR-LEGAL-10). On the order,
    // not a revision: no adjustment re-accepts them. Null where the deployment
    // publishes no terms, and on orders placed before it did.
    termsVersionId: uuid('termsVersionId').references(() => pageVersions.id, {
      onDelete: 'restrict',
    }),
    // The tax basis the order was submitted under (NFR-LEGAL-11). On the
    // order, not a revision, like the terms: a shop that becomes liable for
    // tax while the order is open does not turn the prices it quoted into net
    // ones, and every view of the order states this rather than today's.
    taxBasis: varchar('taxBasis', { length: 16 }).notNull(),
    // When the personal details on every version of this order were removed
    // (NFR-LEGAL-14): the account behind it was deleted, its retention ran
    // out, or a guest asked. Null while the order still carries them. The
    // sweep reads it so that it never clears, and records, an order twice.
    personalDataRemovedAt: timestamp('personalDataRemovedAt', {
      withTimezone: true,
    }),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // When anything at all last happened to this order — a version written, a
    // payment recorded, the customer's view moved on, the account behind it
    // closed. A column rather than the greatest of the four, because it is
    // what the outbound read orders and pages by (FR-ADM-08) and a sort over
    // an expression across two tables is neither indexable nor stable. Every
    // write to an order sets it; nothing else does.
    updatedAt: timestamp('updatedAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('orders_userId_idx').on(t.userId),
    index('orders_createdAt_idx').on(t.createdAt),
    // The outbound read's ordering, written down once: the index that serves
    // the sort serves the cursor's seek.
    index('orders_updatedAt_idx').on(t.updatedAt, t.id),
    check('orders_status_known', oneOf('status', ORDER_STATUSES)),
    check('orders_tax_basis_known', oneOf('taxBasis', TAX_BASES)),
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
    // Who wrote it from outside (FR-ADM-08): the owning system's own name for
    // whoever acted, or the credential's name where it named nobody. An opaque
    // label and never a reference — the person is a user of another system,
    // and matching one of those onto an account here would put one person's
    // name on another's work. Null on everything written in this shop, which
    // is what makes this column the answer to "did the exchange write this".
    source: varchar('source', { length: ORDER_WRITE_ACTOR_MAX }),
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
 * `priceMinor` is the price of one piece, so `lineTotalMinor` is a plain
 * multiplication and a line stays exact and reconstructible. Prices in the
 * units the line was bought through are derived at render time.
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
    // `products.images` and `categories.mark`.
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
    // The tier-resolved price of one piece, as it stood.
    priceMinor: integer('priceMinor').notNull(),
    // The rate the line was taxed at when its version was written: the
    // product's own, or the deployment's default (NFR-LEGAL-11). Null under an
    // order whose basis charges no tax. A statement only — nothing multiplies
    // by it.
    taxRate: numeric('taxRate', { precision: 5, scale: 2, mode: 'number' }),
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
      'order_items_tax_rate_percent',
      sql`${t.taxRate} is null or ${t.taxRate} between 0 and 100`,
    ),
    check(
      'order_items_quantities_positive',
      // The reading only has to be positive: a line of two packs read as boxes
      // is 0.2 of one.
      sql`${t.quantity} > 0 and ${t.pieces} >= 1`,
    ),
    // The exactness rule, in the database: a line total is a multiplication of
    // whole pieces, with nothing rounded.
    check(
      'order_items_total_exact',
      sql`${t.lineTotalMinor} = ${t.priceMinor} * ${t.pieces}`,
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
