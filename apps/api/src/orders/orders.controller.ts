import { Controller, Logger, UseGuards } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
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
import { CartChangedException, OrdersService } from './orders.service';

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
  @TsRestHandler(ordersContract.submitOrder, { validateResponses: true })
  submitOrder(
    @CurrentUserOptional() user: AuthUser | null,
    @PricingTier() tierId: string | null,
  ) {
    return tsRestHandler(ordersContract.submitOrder, async ({ body }) => {
      // ADR 0015's honeypot: a bot fills it, a person never sees it. Refused
      // rather than silently accepted — unlike the inquiry form, an order the
      // customer believes was placed and was not is worse than a plain refusal.
      if (body.website) {
        this.logger.warn('Rejected order: honeypot field populated');
        return {
          status: 400 as const,
          body: { code: 'empty-cart' as const, message: 'Rejected' },
        };
      }

      try {
        const placed = await this.orders.submit(body, user?.id ?? null, tierId);
        this.audit.record('order.placed', user, {
          reference: placed.reference,
        });
        return { status: 201 as const, body: placed };
      } catch (error) {
        if (error instanceof CartChangedException) {
          return {
            status: 409 as const,
            body: {
              code: 'cart-changed' as const,
              message: 'The cart changed since it was last priced',
              preview: error.priced.preview,
            },
          };
        }
        throw error;
      }
    });
  }

  @Auth()
  @TsRestHandler(ordersContract.listMyOrders, { validateResponses: true })
  listMyOrders(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(ordersContract.listMyOrders, async ({ query }) => ({
      status: 200 as const,
      body: await this.orders.listForUser(actor.id, query.page ?? 1),
    }));
  }

  @Auth()
  @TsRestHandler(ordersContract.getMyOrder, { validateResponses: true })
  getMyOrder(@CurrentUser() actor: AuthUser) {
    return tsRestHandler(ordersContract.getMyOrder, async ({ params }) => ({
      status: 200 as const,
      body: await this.orders.getForUser(actor.id, params.reference),
    }));
  }

  /**
   * The token is the credential (FR-NOTIF-06), so no guard and no session:
   * whoever holds the mailed link holds the order summary. Which is exactly why
   * it is throttled (NFR-SEC-06) — an unguessable token stays unguessable, and
   * nothing honest reads this endpoint in a loop.
   */
  @OrderTokenThrottle()
  @TsRestHandler(ordersContract.getOrderByToken, { validateResponses: true })
  getOrderByToken() {
    return tsRestHandler(
      ordersContract.getOrderByToken,
      async ({ params }) => ({
        status: 200 as const,
        body: await this.orders.getByToken(params.token),
      }),
    );
  }
}
