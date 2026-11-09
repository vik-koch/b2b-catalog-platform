import { Module } from '@nestjs/common';

import { AuditLogger } from '../../platform/audit/audit.logger';
import { SessionModule } from '../../platform/auth/session.module';
import {
  ALTERNATE_LAYOUT,
  COMPANY_ID_RULE,
  loadAlternateLayout,
  loadCompanyIdRule,
  loadMoneyFormat,
  loadOrderCurrency,
  loadPdfFont,
  loadShopTimeZone,
  MONEY_FORMAT,
  ORDER_CURRENCY,
  PDF_FONT,
  SHOP_TIME_ZONE,
} from '../../platform/config/deployment-config';
import { MailModule } from '../../platform/mail/mail.module';
import { MediaModule } from '../../platform/media/media.module';
import { PdfFaces } from '../../platform/pdf/pdf-faces';
import {
  ACCEPTED_CUSTOMER_TYPES,
  ADDRESS_CONFIG,
  loadAcceptedCustomerTypes,
  loadAddressConfig,
} from '../accounts/accounts-config';
import { AddressBookModule } from '../accounts/address-book.module';
import {
  loadPairingsEnforced,
  loadTaxConfig,
  PAIRINGS_ENFORCED,
  TAX_CONFIG,
} from '../catalog/catalog-config';
import { loadTermsPublished, TERMS_PUBLISHED } from '../site/site-config';
import { OrderDocumentActs } from './order-document-acts';
import { OrderDocumentFiles } from './order-document-files';
import { OrderDocumentsController } from './order-documents.controller';
import { OrderDocumentsService } from './order-documents.service';
import { OrderNotifications } from './order-notifications';
import { OrderPdf } from './order-pdf';
import { OrderPersonalData } from './order-personal-data';
import { OrderReader } from './order-reader';
import { OrderRules } from './order-rules';
import { OrderWriter } from './order-writer';
import {
  BILLING_ADDRESS_ENABLED,
  DELIVERY_CONFIG,
  loadBillingAddressEnabled,
  loadDeliveryConfig,
  loadOrderReferenceConfig,
  loadPickupLocations,
  ORDER_REFERENCE_CONFIG,
  PICKUP_LOCATIONS,
} from './ordering-config';
import { loadTermsAttached, TERMS_ATTACHED } from './terms-config';
import { TermsPdf } from './terms-pdf';

/**
 * What every ordering audience shares: the reads, the one writer of versions
 * (FR-ADM-08: an exchange and a manager leave the same thread), the rules an
 * order is held to, and the cart's pricer, so an order is never priced by a
 * second code path. `AddressBookModule` rather than `AddressesModule`: the
 * rules need the validation, not the account-scoped controllers.
 */
@Module({
  imports: [SessionModule, AddressBookModule, MailModule, MediaModule],
  controllers: [OrderDocumentsController],
  providers: [
    OrderReader,
    OrderWriter,
    OrderRules,
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
    { provide: SHOP_TIME_ZONE, useFactory: loadShopTimeZone },
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
  exports: [
    OrderReader,
    OrderWriter,
    OrderRules,
    OrderNotifications,
    OrderDocumentsService,
    OrderDocumentActs,
    OrderPersonalData,
    TermsPdf,
    // What the storefront's checkout and the staff screens read.
    ORDER_REFERENCE_CONFIG,
    SHOP_TIME_ZONE,
    ORDER_CURRENCY,
    PAIRINGS_ENFORCED,
    TERMS_PUBLISHED,
    TAX_CONFIG,
    ALTERNATE_LAYOUT,
  ],
})
export class OrderingCoreModule {}
