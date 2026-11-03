import {
  OrderingParty,
  OrderSubmission,
} from '@b2b-catalog-platform/shared/core/ordering';
import { OrderReferenceConfig, TaxConfig } from '@b2b-catalog-platform/shared';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { formatPersonName } from '@b2b-catalog-platform/shared/core/accounts';
import { notFound, Fulfilment } from '../../core/ordering/order-rows';
import { OrderReader } from '../../core/ordering/order-reader';
import { OrderRules } from '../../core/ordering/order-rules';
import {
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PAIRINGS_ENFORCED,
  TERMS_PUBLISHED,
  TAX_CONFIG,
} from '../../config/deployment-config';
import { DRIZZLE } from '../../db/database.module';
import { currentPageVersion } from '../../core/site/page-versions';
import {
  customerTiers,
  orderItems,
  orderRevisions,
  orders,
  users,
} from '../../db/schema';
import { priceCart, PricedCart } from '../../core/ordering/cart-pricing';
import { CartChangedException } from '../../core/ordering/cart-changed-exception';
import { PairingUnsatisfiedException } from '../../core/ordering/pairing-unsatisfied-exception';
import { OrderNotifications } from '../../core/ordering/order-notifications';
import { TermsPdf } from '../../core/ordering/terms-pdf';
import { isUniqueViolation } from '../../db/pg-errors';
import {
  ORDER_REFERENCE_ATTEMPTS,
  orderPublicToken,
  orderReference,
} from '../../core/ordering/order-reference';
import * as schema from '../../db/schema';

/**
 * Placing an order (FR-CART-03/04). The cart is re-priced through the
 * preview's own `priceCart` and refused the moment anything moved: nothing a
 * browser sends decides what an order costs.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger('Orders');

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<typeof schema>,
    private readonly reads: OrderReader,
    private readonly rules: OrderRules,
    private readonly notifications: OrderNotifications,
    private readonly termsPdf: TermsPdf,
    @Inject(ORDER_REFERENCE_CONFIG)
    private readonly reference: OrderReferenceConfig,
    @Inject(ORDER_CURRENCY) private readonly currency: string,
    @Inject(PAIRINGS_ENFORCED) private readonly pairingsEnforced: boolean,
    @Inject(TERMS_PUBLISHED) private readonly termsPublished: boolean,
    @Inject(TAX_CONFIG) private readonly tax: TaxConfig,
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
    const priced = await priceCart(this.db, submission.lines, tierId, this.tax);
    const unchanged =
      priced.preview.complete &&
      priced.preview.totalMinor === submission.expectedTotalMinor &&
      priced.preview.lines.every((line) => line.issues.length === 0);
    if (!unchanged) {
      throw new CartChangedException(priced);
    }
    this.assertPairings(priced);

    this.rules.assertAddresses(submission);
    const party = await this.resolveParty(submission, userId);
    const fulfilment = this.rules.resolveFulfilment(submission);

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
    // Nothing in here may fail the request. The order is already committed and
    // the customer is about to be shown its reference — so a read that fails
    // after the commit, or a deployment missing its staff inbox, is logged and
    // swallowed exactly as an unreachable SMTP already is. Failing instead
    // would answer an error for an order that exists, and a customer who
    // retries would place a second one.
    try {
      const order = await this.reads.getForStaff(placed.reference);
      await this.notifications.placed(
        order,
        placed.publicToken,
        await this.termsPdf.receiptAttachments(order),
      );
    } catch (error) {
      this.logger.error(
        `Could not notify about order ${placed.reference}`,
        error,
      );
    }
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
    this.rules.assertParty(party, submission.paymentMethod);
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

    const person = formatPersonName(account.firstName, account.lastName);
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
    const billing = this.rules.billingAddress(submission);
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
          // Read inside the transaction, so a save landing mid-submit cannot
          // leave the order naming a version it was not placed under.
          const terms = this.termsPublished
            ? await currentPageVersion(tx, 'terms')
            : undefined;
          const [order] = await tx
            .insert(orders)
            .values({
              reference,
              publicToken,
              userId: context.userId,
              termsVersionId: terms?.id ?? null,
              taxBasis: this.tax.basis,
            })
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
                lineTotalMinor: preview.lineTotalMinor,
                taxRate: row.taxRate,
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
}
