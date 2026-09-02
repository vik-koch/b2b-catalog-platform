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
  ilike,
  inArray,
  or,
  sql,
  SQL,
} from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { PgColumn } from 'drizzle-orm/pg-core';
import {
  AddressInput,
  AdminOrderDetail,
  AdminOrderLine,
  DeliveryConfig,
  OrderDetail,
  OrderingParty,
  OrderLine,
  OrderReferenceConfig,
  OrderStatus,
  OrderSubmission,
  OrderSummary,
  ORDER_PAGE_SIZE,
  Pagination,
  ProductUnit,
  resolveDeliveryZone,
  StaffOrderSort,
} from '@b2b-catalog-platform/shared';
import { AddressesService } from '../addresses/addresses.service';
import { OrderNotifications } from './order-notifications';
import { publiclyVisible } from '../catalog/product-view';
import {
  BILLING_ADDRESS_ENABLED,
  COMPANY_ID_RULE,
  CompanyIdRule,
  DELIVERY_CONFIG,
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PICKUP_LOCATIONS,
  PickupLocation,
} from '../config/deployment-config';
import { DRIZZLE } from '../db/database.module';
import * as schema from '../db/schema';
import {
  customerTiers,
  orderItems,
  orders,
  products,
  users,
} from '../db/schema';
import { PricedCart, priceCart } from './cart-pricing';
import {
  ORDER_REFERENCE_ATTEMPTS,
  isUniqueViolation,
  orderPublicToken,
  orderReference,
} from './order-reference';

type OrderRow = typeof orders.$inferSelect;
type OrderItemRow = typeof orderItems.$inferSelect;

/** The one 404 the order routes answer with. Another customer's order is a 404
 * as well: whether a reference exists is not a stranger's business. */
const notFound = () =>
  new NotFoundException({
    code: 'order-not-found',
    message: 'Order not found',
  });

/** Where an order goes: an address with the zone it fell into, or an office. */
interface Fulfilment {
  address: AddressInput | null;
  zone: { key: string; freeFromMinor: number | null } | null;
  pickup: PickupLocation | null;
}

/**
 * Order requests (FR-CART-03/04, FR-ACC-01): priced, recorded and read back.
 *
 * Submission re-prices from scratch through the same `priceCart` the preview
 * uses and refuses — with a fresh preview — the moment anything has moved. The
 * customer's `expectedTotalMinor` is a comparand and never an input; nothing a
 * browser sends decides what an order costs.
 */
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
 * an approved order is in hand, and the two refusals are over. Columns are
 * qualified by hand — a bare name in a template binds to whatever table the
 * surrounding query happens to make available.
 */
const statusPriority = sql<number>`case ${orders.status}
  when 'requested' then 0
  when 'approved' then 1
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
   * The addresses an order carries, by the deployment's own country rules — the
   * same ones a saved address is held to. A guest's address never passed
   * through the book, so this is the only place it is checked.
   */
  private assertAddresses(submission: OrderSubmission): void {
    const billing = this.billingAddress(submission);
    if (billing) this.checkAddress(billing);
    if (submission.deliveryAddress) {
      this.checkAddress(submission.deliveryAddress);
    }
  }

  /**
   * The address the invoice goes to, as this deployment answers the question.
   * Where it invoices none of its own (FR-CART-07), a browser sending one
   * anyway is out of step with the config its form was drawn from, and the
   * order carries nothing rather than an address the shop does not use.
   */
  private billingAddress(submission: OrderSubmission): AddressInput | null {
    if (!this.billingAddressEnabled) return null;
    if (!submission.billingAddress) {
      throw new BadRequestException({
        code: 'billing-address-required',
        message: 'This deployment invoices an address of its own',
      });
    }
    return submission.billingAddress;
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

    if (
      party.registrationId !== null &&
      !this.companyIdRule(party.registrationId)
    ) {
      throw new BadRequestException({
        code: 'invalid-company-id',
        message: 'The registration number matches no configured format',
      });
    }

    if (submission.paymentMethod === 'bank-transfer' && !party.registrationId) {
      throw new BadRequestException({
        code: 'billing-details-required',
        message: 'Bank transfer invoices a company, which needs its number',
      });
    }

    if (submission.paymentMethod === 'cash' && party.registrationId) {
      throw new BadRequestException({
        code: 'cash-not-available',
        message: 'A company is invoiced or pays by card, never in cash',
      });
    }

    return party;
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
  private resolveFulfilment(submission: OrderSubmission): Fulfilment {
    if (submission.fulfilmentMethod === 'delivery') {
      const address = submission.deliveryAddress;
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

    const key = submission.pickupLocationKey;
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
          const [order] = await tx
            .insert(orders)
            .values({
              reference,
              publicToken,
              userId: context.userId,
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
            })
            .returning({ id: orders.id });

          await tx.insert(orderItems).values(
            priced.lines.map(({ preview, row }, index) => {
              // Every line was checked above; this narrows the type and would
              // only fire if that check were ever loosened.
              if (!row || preview.lineTotalMinor === null) {
                throw new Error('an unpriced line reached the insert');
              }
              return {
                orderId: order.id,
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
  ): Promise<{
    items: (OrderSummary & {
      customerEmail: string | null;
      contactName: string;
    })[];
    pagination: Pagination;
  }> {
    const conditions: SQL[] = [];
    if (status) conditions.push(eq(orders.status, status));
    const search = this.searchCondition(q);
    if (search) conditions.push(search);
    const where = conditions.length ? and(...conditions) : undefined;
    const { rows, pagination } = await this.page(where, page, sort);
    const counts = await this.itemCounts(rows.map((row) => row.id));
    const emails = await this.customerEmails(rows);

    return {
      items: rows.map((row) => ({
        ...toSummary(row, counts.get(row.id) ?? 0),
        customerEmail: row.userId ? (emails.get(row.userId) ?? null) : null,
        contactName: row.contactName,
      })),
      pagination,
    };
  }

  async getForUser(userId: string, reference: string): Promise<OrderDetail> {
    const row = await this.row(
      and(eq(orders.reference, reference), eq(orders.userId, userId)),
    );
    return this.toDetail(row);
  }

  /** The mailed link's view (FR-NOTIF-06). The token is the only credential,
   * so it is matched on its own — no session is consulted. */
  async getByToken(token: string): Promise<OrderDetail> {
    return this.toDetail(await this.row(eq(orders.publicToken, token)));
  }

  async getForStaff(reference: string): Promise<AdminOrderDetail> {
    const row = await this.row(eq(orders.reference, reference));
    const items = await this.items(row.id);
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
      lines: detail.lines.map(
        (line, index): AdminOrderLine => ({
          ...line,
          priceMinor: items[index].priceMinor,
          priceBasisPieces: items[index].priceBasisPieces,
        }),
      ),
      customerEmail: customer?.email ?? null,
      tierKey: row.tierKey,
      statusChangedAt: row.statusChangedAt.toISOString(),
    };
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
  private searchCondition(q: string | undefined): SQL | undefined {
    const term = q?.trim();
    if (!term) return undefined;
    const like = `%${term}%`;
    return or(
      ilike(orders.reference, like),
      ilike(orders.contactName, like),
      ilike(orders.contactEmail, like),
      ilike(orders.partyName, like),
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
    const { rows, pagination } = await this.page(where, page);
    const counts = await this.itemCounts(rows.map((row) => row.id));
    return {
      items: rows.map((row) => toSummary(row, counts.get(row.id) ?? 0)),
      pagination,
    };
  }

  private async page(
    where: SQL | undefined,
    page: number,
    sort: StaffOrderSort = 'placed_desc',
  ): Promise<{ rows: OrderRow[]; pagination: Pagination }> {
    const total = await this.db.$count(orders, where);
    const totalPages = Math.ceil(total / ORDER_PAGE_SIZE);
    const current = Math.max(1, page);
    const rows = await this.db
      .select()
      .from(orders)
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

  private async row(where: ReturnType<typeof and>): Promise<OrderRow> {
    const [row] = await this.db.select().from(orders).where(where).limit(1);
    if (!row) throw notFound();
    return row;
  }

  private async items(orderId: string): Promise<OrderItemRow[]> {
    return this.db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, orderId))
      .orderBy(orderItems.sortOrder);
  }

  private async itemCounts(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.db
      .select({ orderId: orderItems.orderId, items: count() })
      .from(orderItems)
      .where(inArray(orderItems.orderId, ids))
      .groupBy(orderItems.orderId);
    return new Map(rows.map((row) => [row.orderId, Number(row.items)]));
  }

  private async customerEmails(rows: OrderRow[]): Promise<Map<string, string>> {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.userId ? [row.userId] : []))),
    ];
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
    const items = known ?? (await this.items(row.id));
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

function toSummary(row: OrderRow, itemCount: number): OrderSummary {
  return {
    reference: row.reference,
    status: row.status as OrderStatus,
    createdAt: row.createdAt.toISOString(),
    totalMinor: row.totalMinor,
    currency: row.currency,
    itemCount,
  };
}
