import {
  ACCEPTED_ORDER_STATUSES,
  AddressInput,
  AdminOrderDetail,
  AdminOrderLine,
  canTransition,
  DeliveryConfig,
  moveDirection,
  nextPaymentState,
  ORDER_PAGE_SIZE,
  OrderActor,
  OrderAdjustment,
  OrderAdjustmentPreview,
  OrderDetail,
  OrderingParty,
  OrderLine,
  OrderNotice,
  OrderReferenceConfig,
  OrderRevision,
  OrderRevisionKind,
  OrderStatus,
  OrderSubmission,
  OrderSummary,
  OrderTransition,
  Pagination,
  PaymentMethod,
  PaymentState,
  paymentStateAfterAdjustment,
  paymentStateWithoutPayment,
  ProductUnit,
  resolveDeliveryZone,
  StaffOrderSort,
  StaffPaymentFilter,
  transitionHasReason,
  transitionNeedsReason,
  TransitionTarget,
} from '@b2b-catalog-platform/shared';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { alias, PgColumn } from 'drizzle-orm/pg-core';
import { AddressesService } from '../addresses/addresses.service';
import { publiclyVisible } from '../catalog/product-view';
import {
  BILLING_ADDRESS_ENABLED,
  COMPANY_ID_RULE,
  CompanyIdRule,
  DELIVERY_CONFIG,
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PAIRINGS_ENFORCED,
  PICKUP_LOCATIONS,
  PickupLocation,
} from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import {
  customerTiers,
  orderItems,
  orderRevisions,
  orders,
  products,
  users,
} from '../db/schema';
import { priceCart, PricedCart } from './cart-pricing';
import { priceAdjustment, PricedAdjustment } from './order-adjustment';
import { OrderNotifications } from './order-notifications';
import {
  isUniqueViolation,
  ORDER_REFERENCE_ATTEMPTS,
  orderPublicToken,
  orderReference,
} from './order-reference';

/**
 * The snapshot half of an order, ready to be spread into a projection — the
 * revision's own bookkeeping (which order, which number, who wrote it) taken
 * out, since a row that says what the order *is* has no use for it.
 */
const {
  id: _revisionId,
  orderId: _revisionOrderId,
  createdAt: _revisionCreatedAt,
  createdBy: _revisionCreatedBy,
  note: _revisionNote,
  kind: _revisionKind,
  notifiedAt: _revisionNotifiedAt,
  revisionNumber: _revisionNumber,
  ...snapshotColumns
} = getTableColumns(orderRevisions);

/** The version the customer is being shown, joined beside the one staff are:
 * how far behind their view is, and where they last heard the order stood. */
const customerRevision = alias(orderRevisions, 'customerRevision');

/**
 * An order and one version of it, read as **one flat row** (ADR 0051).
 *
 * Flattened on purpose: the snapshot columns land exactly where they used to
 * live, so everything that reads an order is untouched by the split and only
 * the write side has to know there are two tables now.
 *
 * The version's `status` and `statusReason` come last and win. That is the
 * whole of how a customer can be shown a version the order has moved past: a
 * revision is a complete reading of the order, and nothing that renders one
 * has to be told which. `orders.status` stays the column a *query* filters and
 * sorts on, and is named through `orders` where that is what is meant.
 */
const orderColumns = {
  ...getTableColumns(orders),
  ...snapshotColumns,
  revisionId: orderRevisions.id,
  revisionNumber: orderRevisions.revisionNumber,
  revisionNote: orderRevisions.note,
  revisionKind: orderRevisions.kind,
  revisionCreatedAt: orderRevisions.createdAt,
  revisionCreatedBy: orderRevisions.createdBy,
  revisionNotifiedAt: orderRevisions.notifiedAt,
  customerRevisionNumber: customerRevision.revisionNumber,
};

type OrderRow = typeof orders.$inferSelect &
  Omit<
    typeof orderRevisions.$inferSelect,
    | 'id'
    | 'orderId'
    | 'createdAt'
    | 'createdBy'
    | 'note'
    | 'kind'
    | 'notifiedAt'
    | 'revisionNumber'
  > & {
    revisionId: string;
    revisionNumber: number;
    revisionNote: string | null;
    revisionKind: string;
    revisionCreatedAt: Date;
    revisionCreatedBy: string | null;
    revisionNotifiedAt: Date | null;
    customerRevisionNumber: number | null;
  };
type OrderItemRow = typeof orderItems.$inferSelect;

/** What the thread says about the customer, read once per order. */
interface CustomerThread {
  /** The newest version a message went out about, 0 if none ever did. */
  number: number;
  /** Which states those messages announced, in no particular order. */
  statuses: OrderStatus[];
  /** The newest version that changed what the order says, 0 if none did. */
  newestChange: number;
}

/** The columns a version carries forward unchanged when the order moves but
 * says nothing new — everything except the version's own bookkeeping. */
type OrderSnapshot = Omit<
  typeof orderRevisions.$inferInsert,
  | 'id'
  | 'orderId'
  | 'revisionNumber'
  | 'createdAt'
  | 'createdBy'
  | 'kind'
  | 'note'
  | 'notifiedAt'
  | 'status'
  | 'statusReason'
>;

/** The one 404 the order routes answer with. Another customer's order is a 404
 * as well: whether a reference exists is not a stranger's business. */
const notFound = () =>
  new NotFoundException({
    code: 'order-not-found',
    message: 'Order not found',
  });

/** Two people writing one order at once. Whichever of the two guards catches
 * it — the version number or the pointer — the loser is told the same thing. */
const orderMovedOn = () =>
  new ConflictException({
    code: 'order-changed',
    message: 'The order was adjusted while this one was being written',
  });

/**
 * The half of an order that is about the order rather than its lines — where
 * it goes, who it is invoiced to and how it is paid. The checkout's submission
 * and a manager's adjustment both carry it, and both are held to it.
 */
type OrderDetails = Pick<
  OrderSubmission,
  | 'fulfilmentMethod'
  | 'deliveryAddress'
  | 'pickupLocationKey'
  | 'billingAddress'
  | 'paymentMethod'
>;

/** Where an order goes: an address with the zone it fell into, or an office. */
interface Fulfilment {
  address: AddressInput | null;
  zone: { key: string; freeFromMinor: number | null } | null;
  pickup: PickupLocation | null;
}

/**
 * How the staff list is ordered (FR-AUTH-03).
 *
 * By default the orders nobody has answered yet come first, then those that
 * have been approved, then the two ways an order ends — which is the order a
 * manager works down. Within a group, and for the date sort, newest first.
 *
 * Every ordering closes with the reference, so two orders placed in the same
 * millisecond cannot swap pages between requests and be shown twice.
 */
function orderListOrderBy(sort: StaffOrderSort): (SQL | PgColumn)[] {
  const newest = [desc(orders.createdAt), desc(orders.reference)];
  switch (sort) {
    case 'placed':
      return [asc(orders.createdAt), desc(orders.reference)];
    case 'placed_desc':
      return newest;
    case 'status':
      return [asc(statusPriority), ...newest];
    case 'status_desc':
      return [desc(statusPriority), ...newest];
  }
}

/**
 * What an order needs, as a number to sort by: a request is waiting on staff,
 * an accepted or ready one is in hand, and a finished or refused one is over.
 * Three groups rather than one rank per status, because the question the sort
 * answers is what to pick up next, not how far along each order is. Columns are
 * qualified by hand — a bare name in a template binds to whatever table the
 * surrounding query happens to make available.
 */
const statusPriority = sql<number>`case ${orders.status}
  when 'requested' then 0
  when 'approved' then 1
  when 'ready' then 1
  else 2
end`;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly addresses: AddressesService,
    @Inject(PICKUP_LOCATIONS)
    private readonly locations: readonly PickupLocation[],
    @Inject(DELIVERY_CONFIG)
    private readonly delivery: DeliveryConfig | undefined,
    @Inject(ORDER_REFERENCE_CONFIG)
    private readonly reference: OrderReferenceConfig,
    @Inject(ORDER_CURRENCY) private readonly currency: string,
    @Inject(COMPANY_ID_RULE) private readonly companyIdRule: CompanyIdRule,
    @Inject(BILLING_ADDRESS_ENABLED)
    private readonly billingAddressEnabled: boolean,
    @Inject(PAIRINGS_ENFORCED)
    private readonly pairingsEnforced: boolean,
    private readonly notifications: OrderNotifications,
  ) {}

  /**
   * Places the order, or explains why it cannot be placed.
   *
   * The order of the checks is deliberate: the cart is priced first, because a
   * stale cart is the refusal a customer is most likely to hit and the one that
   * carries a screenful of corrections with it. The party checks follow, since
   * they are about the form rather than the catalog.
   */
  async submit(
    submission: OrderSubmission,
    userId: string | null,
    tierId: string | null,
  ): Promise<{ reference: string; publicToken: string }> {
    const priced = await priceCart(this.db, submission.lines, tierId);
    const unchanged =
      priced.preview.complete &&
      priced.preview.totalMinor === submission.expectedTotalMinor &&
      priced.preview.lines.every((line) => line.issues.length === 0);
    if (!unchanged) {
      throw new CartChangedException(priced);
    }
    this.assertPairings(priced);

    this.assertAddresses(submission);
    const party = await this.resolveParty(submission, userId);
    const fulfilment = this.resolveFulfilment(submission);

    return this.insertOrder(submission, priced, {
      userId,
      tierKey: await this.tierKey(tierId),
      fulfilment,
      party,
    });
  }

  /**
   * The customer's mail about where their order has got to (FR-NOTIF-03).
   *
   * Read back from the row rather than passed along: the mail says what the
   * order is, and the row is where that is true.
   *
   * `since` is the version they were last written to about, which is what
   * decides the mail's second half. Every change written between then and now
   * is quoted — one mail for a change agreed on the phone and the confirmation
   * that followed it, rather than one per version — and a move with no change
   * behind it says only that the order moved.
   *
   * `notice` is what this message is *for*, which the status alone cannot say:
   * the same `approved` can be the shop accepting an order, the shop walking a
   * packed one back a step, or the shop changing one that was already accepted,
   * and a mail that read them all the same way would tell two of the three a
   * small lie.
   */
  private async mailCustomer(
    reference: string,
    since: number,
    notice: OrderNotice,
  ): Promise<void> {
    // Read through the customer's own projection: the mail describes the
    // version they are shown, and reading it any other way is how a message
    // ends up describing something the page it links to does not.
    const row = await this.row(eq(orders.reference, reference), 'customer');
    const changes = await this.changesSince(row.id, since);
    await this.notifications.statusChanged(
      await this.staffDetail(row),
      row.publicToken,
      notice,
      changes,
    );
  }

  /**
   * What the shop said about every change written since the customer was last
   * told — their words, newest last, so the mail reads as the account of one
   * conversation.
   *
   * Only adjustments: a move says what it is by being a move, and quoting a
   * reason twice is the same sentence in two places.
   */
  private async changesSince(
    orderId: string,
    since: number,
  ): Promise<string[]> {
    return this.adjustmentNotes(
      orderId,
      sql`${orderRevisions.revisionNumber} > ${since}`,
    );
  }

  /** The shop's account of the changes to one order, oldest first, over
   * whichever stretch of the thread the caller is asking about. */
  private async adjustmentNotes(
    orderId: string,
    range: SQL,
  ): Promise<string[]> {
    const rows = await this.db
      .select({ note: orderRevisions.note })
      .from(orderRevisions)
      .where(
        and(
          eq(orderRevisions.orderId, orderId),
          eq(orderRevisions.kind, 'adjustment'),
          range,
        ),
      )
      .orderBy(asc(orderRevisions.revisionNumber));
    return rows.flatMap((row) => (row.note ? [row.note] : []));
  }

  /**
   * Which versions of an order have actually put something in the customer's
   * inbox (FR-NOTIF-03) — the newest of them, which states they announced —
   * and whether a change of the shop's is sitting above the version they are
   * shown, waiting for somebody to mention it.
   *
   * Derived from the thread rather than kept as pointers of its own. There is
   * already one pointer on the order — what the customer is looking at — and
   * another saying what they were told would be a fact stored twice, free to
   * disagree with the stamps that produced it.
   */
  private async customerThread(orderId: string): Promise<CustomerThread> {
    const rows = await this.db
      .select({
        number: orderRevisions.revisionNumber,
        status: orderRevisions.status,
        kind: orderRevisions.kind,
        notifiedAt: orderRevisions.notifiedAt,
      })
      .from(orderRevisions)
      .where(eq(orderRevisions.orderId, orderId));
    const told = rows.filter((row) => row.notifiedAt !== null);
    const highest = (of: typeof rows) =>
      of.reduce((found, row) => Math.max(found, row.number), 0);
    return {
      number: highest(told),
      statuses: [...new Set(told.map((row) => row.status as OrderStatus))],
      newestChange: highest(rows.filter((row) => row.kind === 'adjustment')),
    };
  }

  /**
   * Bring the customer's view up to the current version, and write to them if
   * asked (FR-NOTIF-03).
   *
   * Two things a manager can be owed here, and they are asked separately
   * because they come apart in practice: the version their page shows, and
   * whether a message went with it. A move taken with the tick cleared leaves
   * the first undone; a move shown to them but not announced leaves the
   * second. Either can be put right afterwards, and neither is the other.
   *
   * Refused only when there is nothing left to do — the customer is on the
   * current version and has been told about it.
   */
  async showCustomerCurrent(
    reference: string,
    notify: boolean,
  ): Promise<AdminOrderDetail> {
    const current = await this.row(eq(orders.reference, reference));
    const notified = await this.customerThread(current.id);
    const shown = current.customerRevisionNumber ?? current.revisionNumber;
    const behind = shown < current.revisionNumber;
    // Re-sending what they are already looking at is allowed — a message that
    // went to a spam folder is one somebody has to be able to send again, and
    // it says exactly what their page says. What is refused is the press that
    // would do nothing at all.
    if (!behind && !notify) {
      throw new ConflictException({
        code: 'nothing-to-tell',
        message: 'The customer is already on this version',
      });
    }

    if (behind) {
      await this.db
        .update(orders)
        .set({ customerRevisionId: current.revisionId })
        .where(eq(orders.id, current.id));
    }
    if (notify) {
      // Stamped before the send rather than after it, and stamped whether or
      // not SMTP answers: the mail cannot fail the move that produced it, so
      // "we wrote to them about this version" is what the shop knows, and a
      // silent failure is the log's business rather than the thread's.
      await this.db
        .update(orderRevisions)
        .set({ notifiedAt: new Date() })
        .where(eq(orderRevisions.id, current.revisionId));
      await this.mailCustomer(
        reference,
        notified.number,
        // Whatever the newest version was written for. A manager pressing this
        // is telling the customer where the order now stands, and the version
        // says whether getting there involved changing it.
        current.revisionKind === 'adjustment' ? 'changed' : 'moved',
      );
    }
    return this.getForStaff(reference);
  }

  /**
   * The mails a placed order produces (FR-NOTIF-05/06), sent after it exists.
   *
   * A step of its own rather than the tail of `submit`, and read back from the
   * stored order rather than assembled from the submission: the mails then say
   * what the order *is* — snapshots, resolved zone and all — and cannot
   * describe it differently from the pages they link to.
   */
  async notifyPlaced(placed: {
    reference: string;
    publicToken: string;
  }): Promise<void> {
    await this.notifications.placed(
      await this.getForStaff(placed.reference),
      placed.publicToken,
    );
  }

  /**
   * Refuses a cart that is missing what its products are sold with, where this
   * deployment says so (FR-SET-04).
   *
   * After the pricing check and before the form's own: it is a fact about the
   * cart, and a customer whose cart also went stale should hear about the stale
   * cart first — that refusal carries the corrections with it.
   *
   * Re-checked here rather than trusted from the browser. The cart page already
   * disables its own button; this is what makes that a rule.
   */
  private assertPairings(priced: PricedCart): void {
    if (!this.pairingsEnforced) return;
    const shortfalls = priced.preview.lines
      .filter((line) => line.pairingShortPieces !== null)
      .map((line) => ({
        slug: line.slug,
        shortPieces: line.pairingShortPieces as number,
      }));
    if (shortfalls.length > 0) {
      throw new PairingUnsatisfiedException(shortfalls);
    }
  }

  /**
   * The addresses an order carries, by the deployment's own country rules — the
   * same ones a saved address is held to. A guest's address never passed
   * through the book, so this is the only place it is checked.
   */
  private assertAddresses(order: OrderDetails): void {
    const billing = this.billingAddress(order);
    if (billing) this.checkAddress(billing);
    if (order.deliveryAddress) {
      this.checkAddress(order.deliveryAddress);
    }
  }

  /**
   * The address the invoice goes to, as this deployment answers the question.
   * Where it invoices none of its own (FR-CART-07), a browser sending one
   * anyway is out of step with the config its form was drawn from, and the
   * order carries nothing rather than an address the shop does not use.
   */
  private billingAddress(order: OrderDetails): AddressInput | null {
    if (!this.billingAddressEnabled) return null;
    if (!order.billingAddress) {
      throw new BadRequestException({
        code: 'billing-address-required',
        message: 'This deployment invoices an address of its own',
      });
    }
    return order.billingAddress;
  }

  /**
   * The book refuses an address with a 409, which is this endpoint's
   * cart-changed answer and carries a re-priced cart with it. Here the same
   * refusals are a malformed submission, so they are re-thrown as the 400 the
   * contract lists them under — otherwise the browser would read a refusal
   * about a postcode as a cart that moved, and look for pricing that is not
   * there.
   */
  private checkAddress(address: AddressInput): void {
    try {
      this.addresses.assertValid(address);
    } catch (error) {
      if (error instanceof ConflictException) {
        throw new BadRequestException(error.getResponse());
      }
      throw error;
    }
  }

  /**
   * Who the order is invoiced to (FR-CART-09). A submission that names nobody
   * means the party the account is registered as, which is read here rather
   * than taken from the browser: it is the account's own record, and staff
   * approved it.
   *
   * Bank transfer invoices a legal entity (FR-CART-04), so it is refused for a
   * party with no registration number. The form does not offer it in that case;
   * this is what makes that a rule rather than a courtesy.
   */
  private async resolveParty(
    submission: OrderSubmission,
    userId: string | null,
  ): Promise<OrderingParty> {
    const party = submission.party ?? (await this.accountParty(userId));
    this.assertParty(party, submission.paymentMethod);
    return party;
  }

  /**
   * The two rules that tie the party to how the order is paid, asked wherever
   * an order is written — the checkout, and a manager adjusting one. A rule
   * only staff were held to on the way in would be a rule the shop could
   * break on the way past.
   */
  private assertParty(party: OrderingParty, method: PaymentMethod): void {
    if (
      party.registrationId !== null &&
      !this.companyIdRule(party.registrationId)
    ) {
      throw new BadRequestException({
        code: 'invalid-company-id',
        message: 'The registration number matches no configured format',
      });
    }

    if (method === 'bank-transfer' && !party.registrationId) {
      throw new BadRequestException({
        code: 'billing-details-required',
        message: 'Bank transfer invoices a company, which needs its number',
      });
    }

    // A company is invoiced. Neither of the two ways a private customer
    // settles up — cash at the door, a card arranged on the phone — leaves the
    // paper a company is owed, and an order written either way would have to
    // be put right before it could be invoiced at all.
    if (method !== 'bank-transfer' && party.registrationId) {
      throw new BadRequestException({
        code: 'cash-not-available',
        message: 'A company is invoiced, never paid in cash or by card',
      });
    }
  }

  /** The party an account is registered as: its company, unless it registered
   * as a person — one who once gave a company name is still invoiced by name.
   * Only a declared person is read that way, so an older account that carries
   * a company and no type at all keeps being invoiced as one. The checkout row
   * reads the same rule, so the order names what the customer was shown. */
  private async accountParty(userId: string | null): Promise<OrderingParty> {
    if (!userId) {
      // A guest has no such record, so their submission has to name the party
      // itself. Its own code: the customer typed a name and it did not arrive.
      throw new BadRequestException({
        code: 'party-required',
        message: 'An order with no account must name the party it is for',
      });
    }

    const [account] = await this.db
      .select({
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        customerType: users.customerType,
        companyName: users.companyName,
        companyRegistrationId: users.companyRegistrationId,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!account) throw notFound();

    const person = [account.firstName, account.lastName]
      .filter(Boolean)
      .join(' ');
    return {
      // The address is the last resort rather than an error: a staff-created
      // account may carry no name at all, and an order must still say who it
      // is for.
      name:
        (account.customerType !== 'person' && account.companyName) ||
        person ||
        account.companyName ||
        account.email,
      registrationId: account.companyRegistrationId,
    };
  }

  /**
   * Where the order goes, decided **once**. The contract guarantees a
   * submission carries exactly one destination — an address or a collection
   * point, never both and never neither — so this is the only place that has to
   * know which it is, and the zone is resolved from the server's own config
   * rather than from anything the browser sent.
   */
  private resolveFulfilment(order: OrderDetails): Fulfilment {
    if (order.fulfilmentMethod === 'delivery') {
      const address = order.deliveryAddress;
      // Narrowed rather than asserted: the refine is what guarantees it, and if
      // that guarantee is ever loosened this must fail loudly, not book an
      // order to nowhere.
      if (!address)
        throw new Error('a delivery order reached submit with no address');
      const zone = resolveDeliveryZone(this.delivery?.zones ?? [], address);
      return {
        address,
        zone: zone && {
          key: zone.key,
          freeFromMinor: zone.freeFromMinor ?? null,
        },
        pickup: null,
      };
    }

    const key = order.pickupLocationKey;
    const location = this.locations.find((entry) => entry.key === key);
    if (!location) {
      throw new BadRequestException({
        code: 'unknown-pickup-location',
        message: 'That collection point does not exist',
      });
    }
    return { address: null, zone: null, pickup: location };
  }

  /** Staff-facing: which list the order was priced from. Null is the default
   * one, which is also what a guest gets. */
  private async tierKey(tierId: string | null): Promise<string | null> {
    if (!tierId) return null;
    const [tier] = await this.db
      .select({ key: customerTiers.key })
      .from(customerTiers)
      .where(eq(customerTiers.id, tierId))
      .limit(1);
    return tier?.key ?? null;
  }

  private async insertOrder(
    submission: OrderSubmission,
    priced: PricedCart,
    context: {
      userId: string | null;
      tierKey: string | null;
      fulfilment: Fulfilment;
      party: OrderingParty;
    },
  ): Promise<{ reference: string; publicToken: string }> {
    const billing = this.billingAddress(submission);
    const { address: delivery, pickup, zone } = context.fulfilment;
    const { shipment } = priced.preview;
    // A random reference collides now and then by design (see order-reference).
    // Retried against the unique index rather than pre-checked, and bounded, so
    // a genuinely broken generator fails loudly instead of looping. Both random
    // values are drawn again per attempt: the violation says only that *some*
    // unique column collided, so re-using either would retry into the same one.
    for (let attempt = 1; attempt <= ORDER_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = orderReference(this.reference);
      const publicToken = orderPublicToken();
      try {
        await this.db.transaction(async (tx) => {
          // The order first, then what it says: the row that carries the
          // reference has to exist before a revision can hang off it, and the
          // pointer back is set once the revision has an id. All three in one
          // transaction, so an order without a current revision is a state
          // nothing outside this block can observe.
          const [order] = await tx
            .insert(orders)
            .values({ reference, publicToken, userId: context.userId })
            .returning({ id: orders.id });

          const [revision] = await tx
            .insert(orderRevisions)
            .values({
              orderId: order.id,
              // What the customer submitted. Every move and every adjustment
              // counts on from here (FR-ORD-03).
              revisionNumber: 1,
              kind: 'submitted',
              status: 'requested',
              contactName: submission.contact.name,
              contactEmail: submission.contact.email,
              contactPhone: submission.contact.phone,
              paymentMethod: submission.paymentMethod,
              fulfilmentMethod: submission.fulfilmentMethod,
              partyName: context.party.name,
              partyRegistrationId: context.party.registrationId,
              billingStreet: billing?.street ?? null,
              billingStreet2: billing?.street2 ?? null,
              billingPostalCode: billing?.postalCode ?? null,
              billingCity: billing?.city ?? null,
              billingRegion: billing?.region ?? null,
              billingCountry: billing?.country ?? null,
              deliveryStreet: delivery?.street ?? null,
              deliveryStreet2: delivery?.street2 ?? null,
              deliveryPostalCode: delivery?.postalCode ?? null,
              deliveryCity: delivery?.city ?? null,
              deliveryRegion: delivery?.region ?? null,
              deliveryCountry: delivery?.country ?? null,
              deliveryZoneKey: zone?.key ?? null,
              deliveryFreeFromMinor: zone?.freeFromMinor ?? null,
              pickupLocationKey: pickup?.key ?? null,
              pickupLocationName: pickup?.name ?? null,
              pickupLocationAddress: pickup?.address ?? null,
              preferredDate: submission.preferredDate,
              customerNote: submission.customerNote,
              totalMinor: priced.preview.totalMinor,
              currency: this.currency,
              tierKey: context.tierKey,
              shipmentCartons: shipment.cartons,
              shipmentVolume: shipment.volume,
              shipmentWeight: shipment.weight,
              shipmentApproximate: shipment.approximate,
              shipmentUncoveredLines: shipment.uncoveredLines,
              // The receipt goes out for every order there is (FR-NOTIF-06),
              // so version 1 is a version the customer was written to about
              // and the thread says so. Stamped with the write for the same
              // reason every other version is: the record is what the shop
              // sent, not what SMTP acknowledged.
              notifiedAt: new Date(),
            })
            .returning({ id: orderRevisions.id });

          await tx
            .update(orders)
            .set({
              currentRevisionId: revision.id,
              // The version the customer holds, from the first: the receipt
              // they are sent describes exactly this one.
              customerRevisionId: revision.id,
            })
            .where(eq(orders.id, order.id));

          await tx.insert(orderItems).values(
            priced.lines.map(({ preview, row }, index) => {
              // Every line was checked above; this narrows the type and would
              // only fire if that check were ever loosened.
              if (!row || preview.lineTotalMinor === null) {
                throw new Error('an unpriced line reached the insert');
              }
              return {
                revisionId: revision.id,
                sortOrder: index,
                productId: row.productId,
                productSourceId: row.sourceId,
                slug: preview.slug,
                name: preview.name ?? preview.slug,
                thumbnail: row.thumbnail,
                unit: preview.unit,
                quantity: row.quantity,
                pieces: row.pieces,
                priceMinor: row.priceMinor,
                priceBasisPieces: row.priceBasisPieces,
                lineTotalMinor: preview.lineTotalMinor,
                note: preview.note,
              };
            }),
          );
        });
        return { reference, publicToken };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error(
      `Could not find a free order reference in ${ORDER_REFERENCE_ATTEMPTS} attempts`,
    );
  }

  async listForUser(
    userId: string,
    page = 1,
  ): Promise<{ items: OrderSummary[]; pagination: Pagination }> {
    return this.list(eq(orders.userId, userId), page);
  }

  async listAll(
    page = 1,
    status?: OrderStatus,
    q?: string,
    sort: StaffOrderSort = 'status',
    payment?: StaffPaymentFilter,
  ): Promise<{
    items: (OrderSummary & {
      customerEmail: string | null;
      contactName: string;
      paymentMethod: PaymentMethod;
      revisionNumber: number;
    })[];
    pagination: Pagination;
  }> {
    const conditions: SQL[] = [];
    if (status) conditions.push(eq(orders.status, status));
    const owed = this.paymentCondition(payment);
    if (owed) conditions.push(owed);
    const search = this.searchCondition(q);
    if (search) conditions.push(search);
    const where = conditions.length ? and(...conditions) : undefined;
    const { rows, pagination } = await this.page(where, page, sort);
    const counts = await this.itemCounts(rows.map((row) => row.revisionId));
    const emails = await this.customerEmails(rows);

    return {
      items: rows.map((row) => ({
        ...toSummary(row, counts.get(row.revisionId) ?? 0),
        customerEmail: row.userId ? (emails.get(row.userId) ?? null) : null,
        contactName: row.contactName,
        paymentMethod: row.paymentMethod as PaymentMethod,
        revisionNumber: row.revisionNumber,
      })),
      pagination,
    };
  }

  /** The customer's own view: the version they were last told about, which is
   * the current one on every order nobody has quietly changed. */
  async getForUser(userId: string, reference: string): Promise<OrderDetail> {
    const row = await this.row(
      and(eq(orders.reference, reference), eq(orders.userId, userId)),
      'customer',
    );
    return this.toDetail(row);
  }

  /** The mailed link's view (FR-NOTIF-06). The token is the only credential,
   * so it is matched on its own — no session is consulted. It shows what the
   * mail that carried it described. */
  async getByToken(token: string): Promise<OrderDetail> {
    return this.toDetail(
      await this.row(eq(orders.publicToken, token), 'customer'),
    );
  }

  async getForStaff(reference: string): Promise<AdminOrderDetail> {
    return this.staffDetail(await this.row(eq(orders.reference, reference)));
  }

  /**
   * One order-and-version row as staff read it — used for the version an
   * order currently shows and for every version it has had.
   *
   * `notified` is the thread's answer to "what have we actually told them",
   * asked once by a caller rendering a whole thread and asked here for
   * everyone else: it is a fact about the order, and reading it per version
   * would be the same query as many times as the order has been touched.
   */
  private async staffDetail(
    row: OrderRow,
    notified?: CustomerThread,
  ): Promise<AdminOrderDetail> {
    const told = notified ?? (await this.customerThread(row.id));
    const items = await this.items(row.revisionId);
    const detail = await this.toDetail(row, items);
    const [customer] = row.userId
      ? await this.db
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, row.userId))
          .limit(1)
      : [];

    return {
      ...detail,
      // Built from the customer's own lines — from the very same rows, so the
      // two views cannot describe the same order differently and the index
      // pairing below cannot slip. Staff simply see more of each line.
      lines: detail.lines.map((line, index): AdminOrderLine => ({
        ...line,
        priceMinor: items[index].priceMinor,
        priceBasisPieces: items[index].priceBasisPieces,
      })),
      customerEmail: customer?.email ?? null,
      tierKey: row.tierKey,
      statusChangedAt: row.statusChangedAt.toISOString(),
      revisionNumber: row.revisionNumber,
      // Null only on an order mid-write, which nothing outside a transaction
      // can read: an order the customer has never been shown does not exist.
      customerRevisionNumber: row.customerRevisionNumber ?? row.revisionNumber,
      notifiedRevisionNumber: told.number,
      notifiedStatuses: told.statuses,
      paidAt: row.paidAt?.toISOString() ?? null,
    };
  }

  /**
   * Every version of one order, newest first (FR-ORD-03).
   *
   * Read through the same projection and the same mapping a current order is,
   * with the join moved from "the version it points at" to "every version it
   * has": a superseded snapshot is not a different kind of thing, and reading
   * it any other way is how two screens end up describing one order
   * differently.
   */
  async getRevisions(reference: string): Promise<OrderRevision[]> {
    // The order first, so a reference nobody has is a 404 rather than an empty
    // list — an order with no versions does not exist.
    const current = await this.row(eq(orders.reference, reference));
    const rows = await this.revisionRows(current.id);
    const notified = await this.customerThread(current.id);
    const authors = await this.emailsOf(
      rows.flatMap((row) =>
        row.revisionCreatedBy ? [row.revisionCreatedBy] : [],
      ),
    );
    return Promise.all(
      rows.map((row) => this.toRevision(row, current, authors, notified)),
    );
  }

  /**
   * One version of an order, read on its own (FR-ORD-03).
   *
   * The reading screen asks for the version it is showing rather than for the
   * thread it belongs to: an order worked on for a fortnight has a great many
   * snapshots, and rendering one of them should not cost all of them.
   */
  async getRevision(reference: string, number: number): Promise<OrderRevision> {
    const current = await this.row(eq(orders.reference, reference));
    const [row] = await this.revisionRows(current.id, number);
    // A version this order never had is the same answer as an order nobody
    // has: there is nothing at that address.
    if (!row) throw notFound();
    const authors = await this.emailsOf(
      row.revisionCreatedBy ? [row.revisionCreatedBy] : [],
    );
    return this.toRevision(
      row,
      current,
      authors,
      await this.customerThread(current.id),
    );
  }

  /** The order joined to its versions rather than to the one it stands on —
   * every version, or the one asked for. */
  private revisionRows(orderId: string, number?: number): Promise<OrderRow[]> {
    return this.db
      .select(orderColumns)
      .from(orders)
      .innerJoin(orderRevisions, eq(orderRevisions.orderId, orders.id))
      .leftJoin(
        customerRevision,
        eq(orders.customerRevisionId, customerRevision.id),
      )
      .where(
        number === undefined
          ? eq(orders.id, orderId)
          : and(
              eq(orders.id, orderId),
              eq(orderRevisions.revisionNumber, number),
            ),
      )
      .orderBy(desc(orderRevisions.revisionNumber));
  }

  /** One version as staff read it: the whole snapshot, plus the four facts
   * that are about the version rather than about the order. */
  private async toRevision(
    row: OrderRow,
    current: OrderRow,
    authors: Map<string, string>,
    notified: CustomerThread,
  ): Promise<OrderRevision> {
    return {
      ...(await this.staffDetail(row, notified)),
      revisionCreatedAt: row.revisionCreatedAt.toISOString(),
      author: row.revisionCreatedBy
        ? (authors.get(row.revisionCreatedBy) ?? null)
        : null,
      kind: row.revisionKind as OrderRevisionKind,
      note: row.revisionNote,
      customerView: row.customerRevisionNumber === row.revisionNumber,
      notifiedAt: row.revisionNotifiedAt?.toISOString() ?? null,
      // Both are facts about the *order*, and every entry in the list repeats
      // them: read against the version the order stands on rather than against
      // the one being listed, which would make each row answer a question
      // nobody asked about it.
      revisionNumber: row.revisionNumber,
      customerRevisionNumber:
        current.customerRevisionNumber ?? current.revisionNumber,
    };
  }

  /**
   * Move an order (FR-ORD-01/02).
   *
   * The rule lives in the shared transition table and is asked here, once, for
   * every caller — staff, customer and whatever asks next. What the actor may
   * do and what the order's current status permits are the same question and
   * get the same answer: an order that has moved on is not this caller's
   * business to be told about in detail.
   *
   * A move **writes a version** (ADR 0051). The snapshot is carried across
   * word for word — a move changes where the order stands and nothing it says
   * — so the thread of versions is the order's whole history and any point in
   * it can be read back complete. That is what lets a customer be shown the
   * order as they were last told it stood while staff work on a later one.
   *
   * The write re-states the version it read, so two managers answering the
   * same order at the same moment cannot both succeed — the second updates
   * nothing and is refused like any other disallowed move.
   */
  private async move(
    where: ReturnType<typeof and>,
    actor: OrderActor,
    to: TransitionTarget,
    reason: string | null,
    byUserId: string,
    told: { notify: boolean; markPaid: boolean; showCustomer: boolean } = {
      notify: false,
      markPaid: false,
      // A customer calling their own order off is looking at the screen that
      // did it: there is nothing to keep from them.
      showCustomer: true,
    },
  ): Promise<OrderRow> {
    const current = await this.row(where);
    const from = current.status as OrderStatus;
    if (!canTransition(actor, from, to)) {
      throw new ConflictException({
        code: 'transition-not-allowed',
        message: 'The order cannot be moved there',
      });
    }
    if (transitionNeedsReason(to, actor) && !reason) {
      throw new BadRequestException({
        code: 'reason-required',
        message: 'Say why, so the customer can be told',
      });
    }
    // The handover of a cash order is one event, so completing it and
    // recording the money is one click. Refused rather than ignored where the
    // order is ending: nothing is owed on an order nobody is filling, and a
    // tick that quietly did nothing would be a manager believing they had
    // recorded a payment.
    if (told.markPaid && transitionHasReason(to)) {
      throw new BadRequestException({
        code: 'payment-not-recordable',
        message: 'Nothing is owed on an order that ends here',
      });
    }
    const paid = told.markPaid && current.paymentState !== 'paid';

    await this.appendRevision(current, {
      kind: 'transition',
      status: to,
      // Only the two refusals carry one, and a move that does not carry a
      // reason clears the one an earlier move left behind.
      statusReason: transitionHasReason(to) ? reason : null,
      byUserId,
      paymentState: paid
        ? 'paid'
        : nextPaymentState(
            current.paymentState as PaymentState,
            current.paymentMethod as PaymentMethod,
            to,
          ),
      movedAt: new Date(),
      // A move is where the order *is*, so the customer's page follows it by
      // default whether or not a message goes with it — otherwise an order out
      // for delivery would still read "confirmed" to the person waiting for
      // it, because a manager decided one mail would do for both steps. Held
      // back only where the caller says so: a step taken by mistake, or one of
      // the intermediate steps an exchange collapses into a single move the
      // customer should read.
      showCustomer: told.showCustomer,
      notified: told.notify,
      paid: paid ? { at: new Date(), by: byUserId } : null,
    });

    // Read back rather than returned from the write: what a caller renders is
    // the order *with* the version it now shows.
    return this.row(eq(orders.id, current.id));
  }

  /**
   * Staff answering an order. Any status the table allows, from any order.
   *
   * The mail goes out here rather than from the caller, because whether there
   * is one to send is something only the write knows: a move the customer's
   * view followed is news, and a move on an order they have already been told
   * was finished is staff putting their own record straight.
   */
  async transitionForStaff(
    reference: string,
    move: OrderTransition,
    byUserId: string,
  ): Promise<AdminOrderDetail> {
    const before = await this.row(eq(orders.reference, reference));
    // Read before the write, because the write is what changes the answer:
    // this is the version the customer was last told about, and so where the
    // mail's account of the changes has to start.
    const notified = await this.customerThread(before.id);
    await this.move(
      eq(orders.reference, reference),
      'staff',
      move.to,
      move.reason,
      byUserId,
      {
        notify: move.notify,
        markPaid: move.markPaid,
        showCustomer: move.showCustomer,
      },
    );
    if (move.notify) {
      await this.mailCustomer(
        reference,
        notified.number,
        // An undo is not news the customer is waiting for, and a mail that
        // announced it as the next step would be describing the order moving
        // forwards when it went back.
        moveDirection(before.status as OrderStatus, move.to) === 'backward'
          ? 'corrected'
          : 'moved',
      );
    }
    return this.getForStaff(reference);
  }

  /**
   * A customer calling their own order off. Scoped to their own rows in the
   * `where`, so an order belonging to somebody else is a 404 before the
   * transition table is even consulted.
   */
  async cancelForUser(
    userId: string,
    reference: string,
    reason: string | null,
  ): Promise<OrderDetail> {
    const moved = await this.move(
      and(eq(orders.reference, reference), eq(orders.userId, userId)),
      'customer',
      'cancelled',
      reason,
      userId,
    );
    return this.toDetail(moved);
  }

  /**
   * What an adjustment would come to (FR-ORD-03), priced and not written.
   *
   * The same arithmetic the write runs, on the same inputs, so the figures a
   * manager approves are the figures that get recorded. It answers with the
   * *proposed* order, not with a diff: what changed is a question about two
   * versions, and the screen holds both.
   */
  async previewAdjustment(
    reference: string,
    input: OrderAdjustment,
  ): Promise<OrderAdjustmentPreview> {
    const current = await this.row(eq(orders.reference, reference));
    const { priced, fulfilment } = await this.priceAdjusted(input);

    return {
      lines: priced.lines.map((line) => ({
        name: line.name,
        slug: line.slug,
        // A staff screen opens every line it can, whatever the storefront
        // thinks of the product — the flags say what state it is in.
        linked: true,
        image: line.thumbnail
          ? { full: line.thumbnail, thumb: line.thumbnail }
          : null,
        unit: line.unit,
        units: line.units,
        quantity: line.quantity,
        pieces: line.pieces,
        priceMinor: line.priceMinor,
        priceBasisPieces: line.priceBasisPieces,
        lineTotalMinor: line.lineTotalMinor,
        note: line.note,
        flags: line.flags,
        listPriceMinor: line.listPriceMinor,
        listPriceBasisPieces: line.listPriceBasisPieces,
      })),
      totalMinor: priced.totalMinor,
      // The order's own currency, not today's config: an old order is priced
      // in what it was priced in, and an adjustment does not re-denominate it.
      currency: current.currency,
      deliveryZone: fulfilment.zone,
      shipment: {
        cartons: priced.shipment.cartons,
        volume: priced.shipment.volume,
        weight: priced.shipment.weight,
        coveredLines: priced.lines.length - priced.shipment.uncoveredLines,
        uncoveredLines: priced.shipment.uncoveredLines,
        approximate: priced.shipment.approximate,
      },
    };
  }

  /**
   * Change what an order says — a new version of it (FR-ORD-03, ADR 0051).
   *
   * It moves nothing. An order being changed is not an order being answered:
   * a request that a manager corrects is still a request, and a packed order
   * whose address changed is still packed. Whether the customer hears about it
   * is a separate decision — the move that follows carries the news, or the
   * manager asks for it outright.
   *
   * The write is one transaction and the pointer move is guarded by the
   * version it was written against, so two managers adjusting one order have
   * one winner and the loser is told the order moved rather than quietly
   * overwriting a colleague.
   *
   * What the customer wrote is not in the payload at all: their note, their
   * line notes and their preferred date are carried across from the version
   * being superseded.
   */
  async adjust(
    reference: string,
    input: OrderAdjustment,
    byUserId: string,
  ): Promise<AdminOrderDetail> {
    const current = await this.row(eq(orders.reference, reference));
    if (current.revisionNumber !== input.basedOnRevision) {
      throw new ConflictException({
        code: 'order-changed',
        message: 'The order was adjusted while this one was being written',
      });
    }

    const notified = await this.customerThread(current.id);
    const { priced, fulfilment, billing } = await this.priceAdjusted(input);
    const status = current.status as OrderStatus;
    const snapshot = this.adjustedSnapshot(current, input, priced, {
      billing,
      fulfilment,
    });
    const lines = priced.lines.map((line, index) => ({
      sortOrder: index,
      productId: line.productId,
      productSourceId: line.sourceId,
      slug: line.slug,
      name: line.name,
      thumbnail: line.thumbnail,
      unit: line.unit,
      quantity: line.quantity,
      pieces: line.pieces,
      priceMinor: line.priceMinor,
      priceBasisPieces: line.priceBasisPieces,
      lineTotalMinor: line.lineTotalMinor,
      note: line.note,
    }));
    if (await this.saysTheSame(current, snapshot, lines)) {
      throw new ConflictException({
        code: 'no-change',
        message: 'This changes nothing the order says',
      });
    }

    await this.appendRevision(current, {
      kind: 'adjustment',
      status,
      statusReason: current.statusReason,
      note: input.note,
      byUserId,
      snapshot,
      lines,
      paymentState: paymentStateAfterAdjustment(
        current.paymentState as PaymentState,
        status,
        input.paymentMethod,
      ),
      movedAt: null,
      // A change the customer has not been told about is not theirs to see:
      // the version they hold is the one the shop last stood behind, and
      // swapping it under them for one nobody has explained is how a page and
      // the message that announced it stop agreeing.
      showCustomer: input.notify,
      notified: input.notify,
      paid: null,
    });

    if (input.notify) {
      await this.mailCustomer(reference, notified.number, 'changed');
    }
    return this.getForStaff(reference);
  }

  /**
   * Whether an adjustment would write a version that says exactly what the one
   * before it says.
   *
   * Compared against the two things a version is made of — the snapshot a move
   * would carry across word for word, and the lines it holds — so nothing can
   * change without this seeing it. The manager's note is deliberately not
   * among them: it is an account of a change rather than a change, and a
   * version whose only content is a sentence about nothing is noise in a
   * history rather than part of one.
   *
   * The refusal lives here and not in the screen because the screen is not the
   * only writer: an exchange that re-sends an order it has already sent must
   * not lengthen the thread by doing so.
   */
  private async saysTheSame(
    current: OrderRow,
    snapshot: OrderSnapshot,
    lines: Omit<typeof orderItems.$inferInsert, 'revisionId'>[],
  ): Promise<boolean> {
    const carried = this.carriedSnapshot(current);
    const sameSnapshot = Object.entries(snapshot).every(
      ([field, value]) => value === carried[field as keyof OrderSnapshot],
    );
    if (!sameSnapshot) return false;

    const items = await this.items(current.revisionId);
    if (items.length !== lines.length) return false;
    return lines.every((line, index) => {
      const item = items[index];
      return (
        line.sortOrder === item.sortOrder &&
        line.productId === item.productId &&
        line.slug === item.slug &&
        line.name === item.name &&
        line.thumbnail === item.thumbnail &&
        line.unit === item.unit &&
        line.quantity === item.quantity &&
        line.pieces === item.pieces &&
        line.priceMinor === item.priceMinor &&
        line.priceBasisPieces === item.priceBasisPieces &&
        line.lineTotalMinor === item.lineTotalMinor &&
        line.note === item.note
      );
    });
  }

  /** The order as an adjustment proposes it should now read. The customer's
   * own — their note, their line notes, the day they asked for — is taken from
   * the version being superseded and cannot be sent at all. */
  private adjustedSnapshot(
    current: OrderRow,
    input: OrderAdjustment,
    priced: PricedAdjustment,
    resolved: { billing: AddressInput | null; fulfilment: Fulfilment },
  ): OrderSnapshot {
    const { address: delivery, pickup, zone } = resolved.fulfilment;
    const { billing } = resolved;
    return {
      contactName: input.contact.name,
      contactEmail: input.contact.email,
      contactPhone: input.contact.phone,
      paymentMethod: input.paymentMethod,
      fulfilmentMethod: input.fulfilmentMethod,
      partyName: input.party.name,
      partyRegistrationId: input.party.registrationId,
      billingStreet: billing?.street ?? null,
      billingStreet2: billing?.street2 ?? null,
      billingPostalCode: billing?.postalCode ?? null,
      billingCity: billing?.city ?? null,
      billingRegion: billing?.region ?? null,
      billingCountry: billing?.country ?? null,
      deliveryStreet: delivery?.street ?? null,
      deliveryStreet2: delivery?.street2 ?? null,
      deliveryPostalCode: delivery?.postalCode ?? null,
      deliveryCity: delivery?.city ?? null,
      deliveryRegion: delivery?.region ?? null,
      deliveryCountry: delivery?.country ?? null,
      deliveryZoneKey: zone?.key ?? null,
      deliveryFreeFromMinor: zone?.freeFromMinor ?? null,
      pickupLocationKey: pickup?.key ?? null,
      pickupLocationName: pickup?.name ?? null,
      pickupLocationAddress: pickup?.address ?? null,
      // The customer's own, carried across: an adjustment is the shop's half
      // of the record and never rewrites theirs.
      preferredDate: current.preferredDate,
      customerNote: current.customerNote,
      totalMinor: priced.totalMinor,
      // The order's own currency, not today's config: an old order is priced
      // in what it was priced in, and an adjustment does not re-denominate it.
      currency: current.currency,
      tierKey: input.tierKey,
      shipmentCartons: priced.shipment.cartons,
      shipmentVolume: priced.shipment.volume,
      shipmentWeight: priced.shipment.weight,
      shipmentApproximate: priced.shipment.approximate,
      shipmentUncoveredLines: priced.shipment.uncoveredLines,
    };
  }

  /** What a version carries when nothing about the order itself changed —
   * every snapshot column of the version being superseded, word for word. */
  private carriedSnapshot(row: OrderRow): OrderSnapshot {
    return {
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      paymentMethod: row.paymentMethod,
      fulfilmentMethod: row.fulfilmentMethod,
      partyName: row.partyName,
      partyRegistrationId: row.partyRegistrationId,
      billingStreet: row.billingStreet,
      billingStreet2: row.billingStreet2,
      billingPostalCode: row.billingPostalCode,
      billingCity: row.billingCity,
      billingRegion: row.billingRegion,
      billingCountry: row.billingCountry,
      deliveryStreet: row.deliveryStreet,
      deliveryStreet2: row.deliveryStreet2,
      deliveryPostalCode: row.deliveryPostalCode,
      deliveryCity: row.deliveryCity,
      deliveryRegion: row.deliveryRegion,
      deliveryCountry: row.deliveryCountry,
      deliveryZoneKey: row.deliveryZoneKey,
      deliveryFreeFromMinor: row.deliveryFreeFromMinor,
      pickupLocationKey: row.pickupLocationKey,
      pickupLocationName: row.pickupLocationName,
      pickupLocationAddress: row.pickupLocationAddress,
      preferredDate: row.preferredDate,
      customerNote: row.customerNote,
      totalMinor: row.totalMinor,
      currency: row.currency,
      tierKey: row.tierKey,
      shipmentCartons: row.shipmentCartons,
      shipmentVolume: row.shipmentVolume,
      shipmentWeight: row.shipmentWeight,
      shipmentApproximate: row.shipmentApproximate,
      shipmentUncoveredLines: row.shipmentUncoveredLines,
    };
  }

  /**
   * The one write every version of an order goes through: the version, the
   * order's pointers, and the lines — one transaction, so an order can never
   * point at a version whose lines are half there.
   *
   * A move carries the snapshot and the lines across untouched; an adjustment
   * supplies both. Nothing else distinguishes them, which is the point: two
   * ways of writing a version would be two ways for the thread to develop a
   * hole in it.
   */
  private async appendRevision(
    current: OrderRow,
    change: {
      kind: OrderRevisionKind;
      status: OrderStatus;
      statusReason: string | null;
      note?: string | null;
      byUserId: string | null;
      snapshot?: OrderSnapshot;
      lines?: Omit<typeof orderItems.$inferInsert, 'revisionId'>[];
      paymentState: PaymentState;
      /** When the order moved, or null where it did not move at all. */
      movedAt: Date | null;
      /** Whether this is the version the customer is now shown. */
      showCustomer: boolean;
      /**
       * Whether a message about this version goes out.
       *
       * Stamped here rather than after the send, and in the same transaction
       * as the version it describes: the mail cannot fail the write that
       * produced it, so "we wrote to them about this version" is what the shop
       * knows, and a silent SMTP failure is the log's business rather than the
       * thread's.
       */
      notified: boolean;
      /** The money, where it arrived with this version — the handover of a
       * cash order, recorded with the move that is the handover. */
      paid: { at: Date; by: string } | null;
    },
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        const [revision] = await tx
          .insert(orderRevisions)
          .values({
            orderId: current.id,
            revisionNumber: current.revisionNumber + 1,
            kind: change.kind,
            status: change.status,
            statusReason: change.statusReason,
            createdBy: change.byUserId,
            note: change.note ?? null,
            notifiedAt: change.notified ? new Date() : null,
            ...(change.snapshot ?? this.carriedSnapshot(current)),
          })
          .returning({ id: orderRevisions.id });

        const [pointed] = await tx
          .update(orders)
          .set({
            currentRevisionId: revision.id,
            ...(change.showCustomer ? { customerRevisionId: revision.id } : {}),
            status: change.status,
            paymentState: change.paymentState,
            // Two facts, written together because they are one observation:
            // a payment state of `paid` and the record of who saw the money
            // arrive and when.
            ...(change.paid
              ? { paidAt: change.paid.at, paidBy: change.paid.by }
              : {}),
            // Only a real move is a move: the line that says when the order
            // last moved must not be restated by a change that left it where
            // it was.
            ...(change.movedAt
              ? {
                  statusChangedAt: change.movedAt,
                  statusChangedBy: change.byUserId,
                }
              : {}),
          })
          // The version it was written against, restated in the write: the
          // second of two writers updates nothing and is told so.
          .where(
            and(
              eq(orders.id, current.id),
              eq(orders.currentRevisionId, current.revisionId),
            ),
          )
          .returning({ id: orders.id });

        if (!pointed) throw orderMovedOn();

        if (change.lines) {
          await tx.insert(orderItems).values(
            change.lines.map((line) => ({
              ...line,
              revisionId: revision.id,
            })),
          );
        } else {
          // Copied in the database rather than read out and written back: the
          // lines are unchanged, and a round trip through this process is a
          // chance for them to stop being.
          await tx.execute(sql`
            insert into ${orderItems} ("revisionId", "sortOrder", "productId",
              "productSourceId", "slug", "name", "thumbnail", "unit",
              "quantity", "pieces", "priceMinor", "priceBasisPieces",
              "lineTotalMinor", "note")
            select ${revision.id}::uuid, "sortOrder", "productId",
              "productSourceId", "slug", "name", "thumbnail", "unit",
              "quantity", "pieces", "priceMinor", "priceBasisPieces",
              "lineTotalMinor", "note"
              from ${orderItems}
              where ${orderItems.revisionId} = ${current.revisionId}::uuid`);
        }
      });
    } catch (error) {
      // Two writers reaching the insert together: the version number is unique
      // per order, so the second collides on it rather than on the pointer the
      // write also restates. Same answer either way.
      if (!isUniqueViolation(error)) throw error;
      throw orderMovedOn();
    }
  }

  /** Everything both the preview and the write need worked out, in the order
   * the checkout works it out in. */
  private async priceAdjusted(input: OrderAdjustment): Promise<{
    priced: PricedAdjustment;
    fulfilment: Fulfilment;
    billing: AddressInput | null;
  }> {
    const priced = await priceAdjustment(
      this.db,
      input.lines,
      await this.tierId(input.tierKey),
    );
    this.assertAddresses(input);
    this.assertParty(input.party, input.paymentMethod);
    return {
      priced,
      fulfilment: this.resolveFulfilment(input),
      billing: this.billingAddress(input),
    };
  }

  /** The price list an adjustment names, as an id. Null is the default one. */
  private async tierId(key: string | null): Promise<string | null> {
    if (!key) return null;
    const [tier] = await this.db
      .select({ id: customerTiers.id })
      .from(customerTiers)
      .where(eq(customerTiers.key, key))
      .limit(1);
    if (!tier) {
      throw new BadRequestException({
        code: 'unknown-tier',
        message: 'That price list does not exist',
      });
    }
    return tier.id;
  }

  /**
   * Record that the money arrived, or take that record back (FR-ORD-04) — a
   * manager's observation, not a transaction. It moves nothing else: a cash
   * order is recorded as paid at the handover and an invoiced one whenever the
   * transfer lands, and neither says anything about where the order stands.
   *
   * Clearing it is the same correction reopening is: a box ticked by mistake
   * must not leave an order marked paid for good, and the shop's books are
   * where a real refund lives. What it clears *to* is not the state the order
   * was in before — that is not recorded — but what its method and status say
   * it owes now.
   */
  async setPayment(
    reference: string,
    paid: boolean,
    byUserId: string,
  ): Promise<AdminOrderDetail> {
    const current = await this.row(eq(orders.reference, reference));
    const cleared = paymentStateWithoutPayment(
      current.status as OrderStatus,
      current.paymentMethod as PaymentMethod,
    );

    const [changed] = await this.db
      .update(orders)
      .set(
        paid
          ? { paymentState: 'paid', paidAt: new Date(), paidBy: byUserId }
          : { paymentState: cleared, paidAt: null, paidBy: null },
      )
      .where(
        and(
          eq(orders.id, current.id),
          // Not already where it is being asked to go, and never on an order
          // nobody owes anything on. Restated in the write rather than checked
          // first, so two managers cannot both record the same payment.
          paid
            ? sql`${orders.paymentState} <> 'paid'`
            : sql`${orders.paymentState} = 'paid'`,
          sql`${orders.status} not in ('declined', 'cancelled')`,
        ),
      )
      .returning();

    if (!changed) {
      throw new ConflictException({
        code: 'payment-not-recordable',
        message: 'Nothing to change on this order',
      });
    }
    return this.getForStaff(reference);
  }

  /**
   * Find-an-order (FR-AUTH-03): one box over the few fields a manager is
   * holding when they look one up — the reference somebody read out, the name
   * they gave, the party on the invoice, or an email address.
   *
   * A fragment match rather than a prefix: a reference is quoted by its tail as
   * often as whole. The account's own email is matched through its account, so
   * an order placed under one address and contacted at another is found by
   * either.
   */

  /**
   * What the payment column is narrowed to — the same three readings the badge
   * gives, so a manager filters by what they can see. `cash` is the reminder
   * one: an order the shop took on, to be paid in cash, with the handover not
   * recorded yet.
   */
  private paymentCondition(filter?: StaffPaymentFilter): SQL | undefined {
    if (!filter) return undefined;
    if (filter === 'cash') {
      return and(
        eq(orderRevisions.paymentMethod, 'cash'),
        eq(orders.paymentState, 'not-due'),
        inArray(orders.status, [
          ...ACCEPTED_ORDER_STATUSES,
          'ready',
          'completed',
        ]),
      );
    }
    return eq(orders.paymentState, filter);
  }

  private searchCondition(q: string | undefined): SQL | undefined {
    const term = q?.trim();
    if (!term) return undefined;
    const like = `%${term}%`;
    return or(
      ilike(orders.reference, like),
      ilike(orderRevisions.contactName, like),
      ilike(orderRevisions.contactEmail, like),
      ilike(orderRevisions.partyName, like),
      inArray(
        orders.userId,
        this.db
          .select({ id: users.id })
          .from(users)
          .where(ilike(users.email, like)),
      ),
    );
  }

  private async list(
    where: ReturnType<typeof eq>,
    page: number,
  ): Promise<{ items: OrderSummary[]; pagination: Pagination }> {
    const { rows, pagination } = await this.page(where, page, 'placed_desc', {
      as: 'customer',
    });
    const counts = await this.itemCounts(rows.map((row) => row.revisionId));
    return {
      items: rows.map((row) => toSummary(row, counts.get(row.revisionId) ?? 0)),
      pagination,
    };
  }

  private async page(
    where: SQL | undefined,
    page: number,
    sort: StaffOrderSort = 'placed_desc',
    read: { as: 'staff' | 'customer' } = { as: 'staff' },
  ): Promise<{ rows: OrderRow[]; pagination: Pagination }> {
    // Counted through the same join the rows are read through — the same
    // version, too: a filter may name a snapshot column, and a count that
    // cannot see the revision would page a different set from the one it is
    // counting.
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(orders)
      .innerJoin(
        orderRevisions,
        eq(
          read.as === 'staff'
            ? orders.currentRevisionId
            : orders.customerRevisionId,
          orderRevisions.id,
        ),
      )
      .where(where);
    const totalPages = Math.ceil(total / ORDER_PAGE_SIZE);
    const current = Math.max(1, page);
    const rows = await this.ordersAsSeen(read.as)
      .where(where)
      .orderBy(...orderListOrderBy(sort))
      .limit(ORDER_PAGE_SIZE)
      .offset((current - 1) * ORDER_PAGE_SIZE);

    return {
      rows,
      pagination: {
        page: current,
        pageSize: ORDER_PAGE_SIZE,
        total,
        totalPages,
      },
    };
  }

  /**
   * Every read of an order goes through here: the order joined to one of its
   * versions. An inner join rather than a left one — an order with no current
   * revision is not an order that reads oddly, it is a broken write, and hiding
   * it behind nulls would spread the breakage into every screen.
   *
   * Which version depends on who is reading. Staff read the order as it now
   * stands; a customer reads the one they were last written to about
   * (FR-NOTIF-03), which is the same one until the shop changes something
   * without telling them, or reopens an order they have already been told was
   * finished.
   */
  private ordersAsSeen(by: 'staff' | 'customer' = 'staff') {
    const shown =
      by === 'staff' ? orders.currentRevisionId : orders.customerRevisionId;
    return this.db
      .select(orderColumns)
      .from(orders)
      .innerJoin(orderRevisions, eq(shown, orderRevisions.id))
      .leftJoin(
        customerRevision,
        eq(orders.customerRevisionId, customerRevision.id),
      );
  }

  private async row(
    where: ReturnType<typeof and>,
    by: 'staff' | 'customer' = 'staff',
  ): Promise<OrderRow> {
    const [row] = await this.ordersAsSeen(by).where(where).limit(1);
    if (!row) throw notFound();
    return row;
  }

  private async items(revisionId: string): Promise<OrderItemRow[]> {
    return this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.revisionId, revisionId))
      .orderBy(orderItems.sortOrder);
  }

  /** Keyed by revision, since that is what the lines hang off: two versions of
   * one order have their own line counts, and only the current one is asked
   * about here. */
  private async itemCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ revisionId: orderItems.revisionId, items: count() })
      .from(orderItems)
      .where(inArray(orderItems.revisionId, ids))
      .groupBy(orderItems.revisionId);
    return new Map(rows.map((row) => [row.revisionId, Number(row.items)]));
  }

  private customerEmails(rows: OrderRow[]): Promise<Map<string, string>> {
    return this.emailsOf(
      rows.flatMap((row) => (row.userId ? [row.userId] : [])),
    );
  }

  /** Accounts by id, in one query — who placed each order in a list, and who
   * wrote each version of one. */
  private async emailsOf(userIds: string[]): Promise<Map<string, string>> {
    const ids = [...new Set(userIds)];
    if (ids.length === 0) return new Map();
    const found = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(inArray(users.id, ids));
    return new Map(found.map((user) => [user.id, user.email]));
  }

  /** `items` where the caller has already read them — `getForStaff` needs the
   * same rows for the basis figures, and it pairs them to these lines by
   * index, which two separate reads of one order have no business deciding. */
  private async toDetail(
    row: OrderRow,
    known?: OrderItemRow[],
  ): Promise<OrderDetail> {
    const items = known ?? (await this.items(row.revisionId));
    // Resolved by product id, never by the slug snapshot — and only where the
    // product is still something a customer may open, so an order never sends
    // anyone into a 404. The *current* slug is what a linked line carries: a
    // product renamed since the order was placed moved, and the snapshot would
    // point at where it used to be.
    const visible = await this.visibleProducts(
      items.map((item) => item.productId),
    );
    const lines = items.map((item): OrderLine => {
      const slug = visible.get(item.productId);
      return {
        name: item.name,
        // The snapshot only survives as the text of an unlinked line.
        slug: slug ?? item.slug,
        linked: slug !== undefined,
        image: item.thumbnail
          ? { full: item.thumbnail, thumb: item.thumbnail }
          : null,
        unit: item.unit as ProductUnit,
        quantity: item.quantity,
        pieces: item.pieces,
        lineTotalMinor: item.lineTotalMinor,
        note: item.note,
      };
    });

    return {
      reference: row.reference,
      status: row.status as OrderStatus,
      paymentState: row.paymentState as PaymentState,
      createdAt: row.createdAt.toISOString(),
      totalMinor: row.totalMinor,
      currency: row.currency,
      itemCount: items.length,
      contact: {
        name: row.contactName,
        email: row.contactEmail,
        phone: row.contactPhone,
      },
      party: {
        name: row.partyName,
        registrationId: row.partyRegistrationId,
      },
      fulfilmentMethod: row.fulfilmentMethod as OrderDetail['fulfilmentMethod'],
      deliveryAddress: row.deliveryStreet
        ? {
            street: row.deliveryStreet,
            street2: row.deliveryStreet2,
            postalCode: row.deliveryPostalCode ?? '',
            city: row.deliveryCity ?? '',
            region: row.deliveryRegion,
            country: row.deliveryCountry ?? '',
          }
        : null,
      pickup: row.pickupLocationKey
        ? {
            key: row.pickupLocationKey,
            name: row.pickupLocationName ?? row.pickupLocationKey,
            address: row.pickupLocationAddress ?? '',
          }
        : null,
      deliveryZone: row.deliveryZoneKey
        ? {
            key: row.deliveryZoneKey,
            freeFromMinor: row.deliveryFreeFromMinor,
          }
        : null,
      billingAddress:
        row.billingStreet &&
        row.billingPostalCode &&
        row.billingCity &&
        row.billingCountry
          ? {
              street: row.billingStreet,
              street2: row.billingStreet2,
              postalCode: row.billingPostalCode,
              city: row.billingCity,
              region: row.billingRegion,
              country: row.billingCountry,
            }
          : null,
      paymentMethod: row.paymentMethod as OrderDetail['paymentMethod'],
      preferredDate: row.preferredDate,
      customerNote: row.customerNote,
      statusReason: row.statusReason,
      // Every change the shop has made up to the version being read, and not
      // one word more: a version is a reading of the order at one moment, and
      // changes made after it were not part of what this version said.
      changes: await this.adjustmentNotes(
        row.id,
        sql`${orderRevisions.revisionNumber} <= ${row.revisionNumber}`,
      ),
      lines,
      shipment: {
        cartons: row.shipmentCartons,
        volume: row.shipmentVolume,
        weight: row.shipmentWeight,
        coveredLines: items.length - row.shipmentUncoveredLines,
        uncoveredLines: row.shipmentUncoveredLines,
        approximate: row.shipmentApproximate,
      },
    };
  }

  private async visibleProducts(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ id: products.id, slug: products.slug })
      .from(products)
      .where(and(inArray(products.id, ids), publiclyVisible));
    return new Map(rows.map((row) => [row.id, row.slug]));
  }
}

/**
 * A cart the server priced differently from what the browser last saw. Carries
 * the fresh preview, so the controller can answer the refusal with the
 * corrected cart rather than telling the customer to try again.
 */
export class CartChangedException extends Error {
  constructor(readonly priced: PricedCart) {
    super('The cart changed while it was being submitted');
  }
}

/**
 * A cart missing what its products are sold with, where the deployment refuses
 * on that (FR-SET-04). Carries the shortfalls, so the page can name the lines
 * rather than send the customer back to hunt for them.
 */
export class PairingUnsatisfiedException extends Error {
  constructor(readonly shortfalls: { slug: string; shortPieces: number }[]) {
    super('The cart is missing what its products are sold with');
  }
}

function toSummary(row: OrderRow, itemCount: number): OrderSummary {
  return {
    reference: row.reference,
    status: row.status as OrderStatus,
    paymentState: row.paymentState as PaymentState,
    fulfilmentMethod: row.fulfilmentMethod as OrderSummary['fulfilmentMethod'],
    createdAt: row.createdAt.toISOString(),
    totalMinor: row.totalMinor,
    currency: row.currency,
    itemCount,
  };
}
