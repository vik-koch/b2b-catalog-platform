import {
  OrderingParty,
  OrderSubmission,
  OrderReferenceConfig,
} from '@b2b-catalog-platform/shared/core/ordering';
import { TaxConfig } from '@b2b-catalog-platform/shared/platform';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { formatPersonName } from '@b2b-catalog-platform/shared/core/accounts';
import {
  detailColumns,
  Fulfilment,
  notFound,
  shipmentColumns,
} from '../../core/ordering/order-rows';
import { OrderReader } from '../../core/ordering/order-reader';
import { OrderRules } from '../../core/ordering/order-rules';
import {
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PAIRINGS_ENFORCED,
  TERMS_PUBLISHED,
  TAX_CONFIG,
} from '../../platform/config/deployment-config';
import { DRIZZLE } from '../../platform/db/database.module';
import { currentPageVersion } from '../../core/site/page-versions';
import {
  customerTiers,
  orderItems,
  orderRevisions,
  orders,
  users,
} from '../../platform/db/schema';
import { priceCart, PricedCart } from '../../core/ordering/cart-pricing';
import { CartChangedException } from '../../core/ordering/cart-changed-exception';
import { PairingUnsatisfiedException } from '../../core/ordering/pairing-unsatisfied-exception';
import { OrderNotifications } from '../../core/ordering/order-notifications';
import { TermsPdf } from '../../core/ordering/terms-pdf';
import { isUniqueViolation } from '../../platform/db/pg-errors';
import {
  ORDER_REFERENCE_ATTEMPTS,
  orderPublicToken,
  orderReference,
} from '../../core/ordering/order-reference';
import * as schema from '../../platform/db/schema';

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
   * The cart is priced first: a stale cart is the likeliest refusal, and it
   * carries the corrections with it.
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
   * The mails a placed order produces (FR-NOTIF-05/06), read back from the
   * stored order so they describe what the pages they link to show.
   */
  async notifyPlaced(placed: {
    reference: string;
    publicToken: string;
  }): Promise<void> {
    // Never fails the request: the order is committed, and a customer told
    // otherwise would place a second one.
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
   * Refused where the deployment enforces pairings (FR-SET-04), after the
   * pricing check: a stale cart's refusal carries the corrections.
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
   * Who the order is invoiced to (FR-CART-09). Naming nobody means the
   * account's own party, read here rather than taken from the browser.
   */
  private async resolveParty(
    submission: OrderSubmission,
    userId: string | null,
  ): Promise<OrderingParty> {
    const party = submission.party ?? (await this.accountParty(userId));
    this.rules.assertParty(party, submission.paymentMethod);
    return party;
  }

  /**
   * The account's own party: its company, unless it registered as a person. An
   * older account with a company and no type is invoiced as one, as the
   * checkout row reads it.
   */
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
      // The email as a last resort: a staff-created account may carry no name.
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
    const { shipment } = priced.preview;
    // A random reference collides now and then by design: retried against the
    // unique index, bounded, with both random values drawn again.
    for (let attempt = 1; attempt <= ORDER_REFERENCE_ATTEMPTS; attempt += 1) {
      const reference = orderReference(this.reference);
      const publicToken = orderPublicToken();
      try {
        await this.db.transaction(async (tx) => {
          // The order, its first version, then the pointer back, in one
          // transaction. The terms are read inside it, so a save mid-submit
          // cannot be named wrongly.
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
              ...detailColumns(
                { ...submission, party: context.party },
                billing,
                context.fulfilment,
              ),
              preferredDate: submission.preferredDate,
              customerNote: submission.customerNote,
              totalMinor: priced.preview.totalMinor,
              currency: this.currency,
              tierKey: context.tierKey,
              ...shipmentColumns(shipment),
              // The receipt goes out for every order (FR-NOTIF-06): version 1
              // is mailed.
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
