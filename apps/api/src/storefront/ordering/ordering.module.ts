import { Module } from '@nestjs/common';
import { AuditLogger } from '../../platform/audit/audit.logger';
import { OrderingCoreModule } from '../../core/ordering/ordering-core.module';
import { SessionModule } from '../../platform/auth/session.module';
import { CheckoutService } from './checkout.service';
import { CustomerOrdersService } from './customer-orders.service';
import { CartController } from './cart.controller';
import { OrdersController } from './orders.controller';

/** The cart's pricing, checkout and a customer's own orders. */
@Module({
  imports: [SessionModule, OrderingCoreModule],
  controllers: [CartController, OrdersController],
  providers: [CheckoutService, CustomerOrdersService, AuditLogger],
})
export class OrderingModule {}
