import { Module } from '@nestjs/common';
import { AddressBookModule } from '../addresses/address-book.module';
import { AuditLogger } from '../audit/audit.logger';
import { AuthModule } from '../auth/auth.module';
import {
  BILLING_ADDRESS_ENABLED,
  COMPANY_ID_RULE,
  DELIVERY_CONFIG,
  MONEY_FORMAT,
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PAIRINGS_ENFORCED,
  PDF_FONT,
  PICKUP_LOCATIONS,
  ADDRESS_CONFIG,
  loadAddressConfig,
  loadBillingAddressEnabled,
  loadCompanyIdRule,
  loadDeliveryConfig,
  loadMoneyFormat,
  loadOrderCurrency,
  loadOrderReferenceConfig,
  loadPairingsEnforced,
  loadPdfFont,
  loadPickupLocations,
} from '../config/deployment-config';
import { MailModule } from '../mail/mail.module';
import { MediaModule } from '../media/media.module';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderDocumentsController } from './order-documents.controller';
import { OrderDocumentsService } from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { OrderPdf } from './order-pdf';
import { CartController } from './cart.controller';
import { OrdersController } from './orders.controller';
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
  imports: [AuthModule, AddressBookModule, MailModule, MediaModule],
  controllers: [
    CartController,
    OrdersController,
    AdminOrdersController,
    OrderDocumentsController,
  ],
  providers: [
    OrdersService,
    OrderNotifications,
    OrderDocumentsService,
    OrderPdf,
    AuditLogger,
    { provide: PICKUP_LOCATIONS, useFactory: loadPickupLocations },
    // The party's registration number is held to the deployment's own formats,
    // the same ones registration applies.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
    { provide: DELIVERY_CONFIG, useFactory: loadDeliveryConfig },
    // Whether an order carries an invoice address of its own.
    {
      provide: BILLING_ADDRESS_ENABLED,
      useFactory: loadBillingAddressEnabled,
    },
    // Whether an unsatisfied pairing refuses the order (FR-SET-04).
    { provide: PAIRINGS_ENFORCED, useFactory: loadPairingsEnforced },
    { provide: ORDER_REFERENCE_CONFIG, useFactory: loadOrderReferenceConfig },
    { provide: ORDER_CURRENCY, useFactory: loadOrderCurrency },
    // The same currency with its locale: what the order mails format against.
    { provide: MONEY_FORMAT, useFactory: loadMoneyFormat },
    // The country list an address is written out with, on a document as on a
    // screen.
    { provide: ADDRESS_CONFIG, useFactory: loadAddressConfig },
    // The face the order summary is printed in, where the deployment names
    // one of its own (FR-ORD-05).
    { provide: PDF_FONT, useFactory: loadPdfFont },
  ],
})
export class OrdersModule {}
