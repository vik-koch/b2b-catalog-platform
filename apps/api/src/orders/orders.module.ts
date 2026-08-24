import { Module } from '@nestjs/common';
import { AddressBookModule } from '../addresses/address-book.module';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import {
  DELIVERY_CONFIG,
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PICKUP_LOCATIONS,
  loadDeliveryConfig,
  loadOrderCurrency,
  loadOrderReferenceConfig,
  loadPickupLocations,
} from '../config/deployment-config';
import { CartController } from './cart.controller';
import { AdminOrdersController, OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

/**
 * The cart's pricing endpoint and the orders it turns into. One module: they
 * share the pricer, and an order priced by a second code path is an order
 * priced differently from the one the customer saw.
 *
 * `AddressBookModule` rather than `AddressesModule` — checkout needs the
 * service's validation, not the account-scoped controllers.
 */
@Module({
  imports: [AuthModule, AddressBookModule],
  controllers: [CartController, OrdersController, AdminOrdersController],
  providers: [
    OrdersService,
    AuditLogger,
    { provide: PICKUP_LOCATIONS, useFactory: loadPickupLocations },
    { provide: DELIVERY_CONFIG, useFactory: loadDeliveryConfig },
    { provide: ORDER_REFERENCE_CONFIG, useFactory: loadOrderReferenceConfig },
    { provide: ORDER_CURRENCY, useFactory: loadOrderCurrency },
  ],
})
export class OrdersModule {}
