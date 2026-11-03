import { Module } from '@nestjs/common';
import { AddressBookModule } from '../accounts/address-book.module';
import { AuditLogger } from '../../audit/audit.logger';
import { SessionModule } from '../../platform/auth/session.module';
import {
  ACCEPTED_CUSTOMER_TYPES,
  loadAcceptedCustomerTypes,
  ALTERNATE_LAYOUT,
  loadAlternateLayout,
  BILLING_ADDRESS_ENABLED,
  COMPANY_ID_RULE,
  DELIVERY_CONFIG,
  MONEY_FORMAT,
  ORDER_CURRENCY,
  ORDER_REFERENCE_CONFIG,
  PAIRINGS_ENFORCED,
  PDF_FONT,
  PICKUP_LOCATIONS,
  TERMS_ATTACHED,
  TERMS_PUBLISHED,
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
  loadTaxConfig,
  loadTermsAttached,
  TAX_CONFIG,
  loadTermsPublished,
} from '../../config/deployment-config';
import { MailModule } from '../../mail/mail.module';
import { MediaModule } from '../../media/media.module';
import { OrderDocumentActs } from './order-document-acts';
import { OrderDocumentsController } from './order-documents.controller';
import { OrderDocumentsService } from './order-documents.service';
import { OrderDocumentFiles } from './order-document-files';
import { OrderPersonalData } from './order-personal-data';
import { OrderNotifications } from './order-notifications';
import { PdfFaces } from '../../pdf/pdf-faces';
import { OrderPdf } from './order-pdf';
import { TermsPdf } from './terms-pdf';
import { OrdersService } from './orders.service';

/**
 * The one order writer and what it needs, for every audience: the storefront
 * and staff modules and the order exchange all write through `OrdersService`
 * (FR-ADM-08), so an exchange and a manager leave the same thread behind them.
 * The cart's pricer lives here too: an order priced by a second code path is
 * an order priced differently from the one the customer saw.
 *
 * `AddressBookModule` rather than `AddressesModule` — checkout needs the
 * service's validation, not the account-scoped controllers.
 */
@Module({
  imports: [SessionModule, AddressBookModule, MailModule, MediaModule],
  controllers: [OrderDocumentsController],
  providers: [
    OrdersService,
    OrderNotifications,
    OrderDocumentsService,
    OrderDocumentActs,
    // A guest's request to have their details removed (NFR-LEGAL-14), and
    // the files that go with them.
    OrderPersonalData,
    OrderDocumentFiles,
    OrderPdf,
    TermsPdf,
    PdfFaces,
    AuditLogger,
    { provide: PICKUP_LOCATIONS, useFactory: loadPickupLocations },
    // The party's registration number is held to the deployment's own formats,
    // the same ones registration applies.
    { provide: COMPANY_ID_RULE, useFactory: loadCompanyIdRule },
    {
      provide: ACCEPTED_CUSTOMER_TYPES,
      useFactory: loadAcceptedCustomerTypes,
    },
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
    { provide: ALTERNATE_LAYOUT, useFactory: loadAlternateLayout },
    { provide: TERMS_PUBLISHED, useFactory: loadTermsPublished },
    { provide: TERMS_ATTACHED, useFactory: loadTermsAttached },
    // The basis an order is submitted under, and the default rate a line
    // without one of its own is taxed at (NFR-LEGAL-11).
    { provide: TAX_CONFIG, useFactory: loadTaxConfig },
  ],
  exports: [OrdersService, OrderDocumentActs, OrderPersonalData, TAX_CONFIG],
})
export class OrderingCoreModule {}
