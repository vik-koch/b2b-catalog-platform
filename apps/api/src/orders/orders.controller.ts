import { Controller, Logger, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, ordersContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import {
  CurrentUser,
  CurrentUserOptional,
} from '../auth/current-user.decorator';
import { OptionalAuthGuard } from '../auth/optional-auth.guard';
import { PricingTier } from '../auth/pricing-tier.decorator';
import {
  OrderTokenThrottle,
  PublicFormThrottle,
} from '../throttling/throttle-presets';
import { AuditLogger } from '../audit/audit.logger';
import { refusals } from '../orpc/refusals';
import {
  CartChangedException,
  OrdersService,
  PairingUnsatisfiedException,
} from './orders.service';

/**
 * Placing an order request and reading it back.
 *
 * Submission is public: a guest orders too (FR-CART-03), so the route reads a
 * session where one is offered — for the customer's own prices and to link the
 * order to the account — and never requires one.
 */
@Controller()
export class OrdersController {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly orders: OrdersService,
    private readonly audit: AuditLogger,
  ) {}

  @PublicFormThrottle()
  @UseGuards(OptionalAuthGuard)
  @Implement(ordersContract.submitOrder)
  submitOrder(
    @CurrentUserOptional() user: AuthUser | null,
    @PricingTier() tierId: string | null,
  ) {
    return implement(ordersContract.submitOrder)
      .use(refusals)
      .handler(async ({ input: { body }, errors }) => {
        // ADR 0015's honeypot: a bot fills it, a person never sees it. Refused
        // rather than silently accepted — unlike the inquiry form, an order the
        // customer believes was placed and was not is worse than a plain
        // refusal.
        if (body.website) {
          this.logger.warn('Rejected order: honeypot field populated');
          throw errors.rejected({ message: 'Rejected' });
        }

        // Staff do not buy. Role is authorization and tier is pricing (they are
        // separate fields for exactly this reason), so a staff session has no
        // tier to be priced at and no party to invoice — and the request would
        // arrive in the inbox they are the ones answering.
        if (user && user.role !== 'user') {
          throw errors['staff-cannot-order']({
            message: 'A staff account cannot place an order request',
          });
        }

        try {
          const placed = await this.orders.submit(
            body,
            user?.id ?? null,
            tierId,
          );
          this.audit.record('order.placed', user, {
            reference: placed.reference,
          });
          // After the order exists, and never able to fail it: a customer who
          // was shown a reference has an order, mail or no mail.
          await this.orders.notifyPlaced(placed);
          return placed;
        } catch (error) {
          if (error instanceof PairingUnsatisfiedException) {
            // Which lines are short travels with it, so the page can name them
            // rather than send the customer back to hunt for them.
            throw errors['pairing-unsatisfied']({
              message: 'The cart is missing what its products are sold with',
              data: { shortfalls: error.shortfalls },
            });
          }
          if (error instanceof CartChangedException) {
            // The fresh pricing travels as the refusal's own data, so the page
            // can show what moved rather than asking again.
            throw errors['cart-changed']({
              message: 'The cart changed since it was last priced',
              data: { preview: error.priced.preview },
            });
          }
          throw error;
        }
      });
  }

  @Auth()
  @Implement(ordersContract.listMyOrders)
  listMyOrders(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.listMyOrders)
      .use(refusals)
      .handler(({ input: { query } }) =>
        this.orders.listForUser(actor.id, query.page ?? 1),
      );
  }

  @Auth()
  @Implement(ordersContract.getMyOrder)
  getMyOrder(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.getMyOrder)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.orders.getForUser(actor.id, params.reference),
      );
  }

  /**
   * The token is the credential (FR-NOTIF-06), so no guard and no session:
   * whoever holds the mailed link holds the order summary. Which is exactly why
   * it is throttled (NFR-SEC-06) — an unguessable token stays unguessable, and
   * nothing honest reads this endpoint in a loop.
   */
  @OrderTokenThrottle()
  @Implement(ordersContract.getOrderByToken)
  getOrderByToken() {
    return implement(ordersContract.getOrderByToken)
      .use(refusals)
      .handler(({ input: { params } }) => this.orders.getByToken(params.token));
  }
}
