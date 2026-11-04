import { Controller, Logger, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { ordersContract } from '@b2b-catalog-platform/shared/storefront/ordering';
import { Auth } from '../../platform/auth/auth.decorator';
import {
  CurrentUser,
  CurrentUserOptional,
} from '../../platform/auth/current-user.decorator';
import { OptionalAuthGuard } from '../../platform/auth/optional-auth.guard';
import { PricingTier } from '../../platform/auth/pricing-tier.decorator';
import {
  OrderTokenThrottle,
  PublicFormThrottle,
} from '../../platform/throttling/throttle-presets';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { refusals } from '../../platform/orpc/refusals';
import { OrderReader } from '../../core/ordering/order-reader';
import { CheckoutService } from './checkout.service';
import { CustomerOrdersService } from './customer-orders.service';
import { CartChangedException } from '../../core/ordering/cart-changed-exception';
import { PairingUnsatisfiedException } from '../../core/ordering/pairing-unsatisfied-exception';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

/**
 * Placing an order and reading it back. Submission reads a session where one
 * is offered and never requires one: a guest orders too (FR-CART-03).
 */
@Controller()
export class OrdersController {
  private readonly logger = new Logger('Orders');

  constructor(
    private readonly checkout: CheckoutService,
    private readonly orders: CustomerOrdersService,
    private readonly reads: OrderReader,
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
        // ADR 0015's honeypot. Refused, not silently accepted: an order the
        // customer believes was placed is worse than a refusal.
        if (body.website) {
          this.logger.warn('Rejected order: honeypot field populated');
          throw errors.rejected({ message: 'Rejected' });
        }

        // Staff do not buy: role is not a pricing tier, and nobody would be
        // invoiced.
        if (user && user.role !== 'user') {
          throw errors['staff-cannot-order']({
            message: 'A staff account cannot place an order request',
          });
        }

        try {
          const placed = await this.checkout.submit(
            body,
            user?.id ?? null,
            tierId,
          );
          this.audit.record('order.placed', user, {
            reference: placed.reference,
          });
          // After the order exists, and never able to fail it: a customer who
          // was shown a reference has an order, mail or no mail.
          await this.checkout.notifyPlaced(placed);
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
        this.orders.listForUser(actor.id, query.page ?? 1, query.state),
      );
  }

  @Auth()
  @Implement(ordersContract.getMyOrder)
  getMyOrder(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.getMyOrder)
      .use(refusals)
      .handler(({ input: { params } }) =>
        this.reads.getForUser(actor.id, params.reference),
      );
  }

  /**
   * The customer calling their own order off (FR-ORD-02). Whether they still
   * may is the transition table's answer, asked in the service.
   */
  @Auth()
  @Implement(ordersContract.cancelMyOrder)
  cancelMyOrder(@CurrentUser() actor: AuthUser) {
    return implement(ordersContract.cancelMyOrder)
      .use(refusals)
      .handler(async ({ input: { params, body } }) => {
        const order = await this.orders.cancelForUser(
          actor.id,
          params.reference,
          body.reason,
        );
        this.audit.record('order.status', actor, {
          reference: order.reference,
          status: order.status,
        });
        // The shop is mailed by the service (FR-NOTIF-07); the customer, who
        // just did it, is not.
        return order;
      });
  }

  /**
   * The token is the credential (FR-NOTIF-06): no guard, no session. Throttled
   * (NFR-SEC-06): nothing honest reads this in a loop.
   */
  @OrderTokenThrottle()
  @Implement(ordersContract.getOrderByToken)
  getOrderByToken() {
    return implement(ordersContract.getOrderByToken)
      .use(refusals)
      .handler(({ input: { params } }) => this.reads.getByToken(params.token));
  }
}
