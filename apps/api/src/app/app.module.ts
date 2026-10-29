import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { AccountModule } from '../account/account.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AddressesModule } from '../addresses/addresses.module';
import { PartiesModule } from '../parties/parties.module';
import { AttributesModule } from '../admin/catalog/attributes/attributes.module';
import { AuthModule } from '../auth/auth.module';
import { ConsentAdminModule } from '../consents/consent-admin.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { DestructionModule } from '../destruction/destruction.module';
import { CatalogModule } from '../storefront/catalog/catalog.module';
import { AdminCatalogModule } from '../admin/catalog/admin-catalog.module';
import { DocumentsModule } from '../admin/catalog/documents/documents.module';
import { OrdersModule } from '../orders/orders.module';
import { PageModule } from '../pages/page.module';
import { MediaModule } from '../media/media.module';
import { ThrottlingModule } from '../throttling/throttling.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncModule } from '../sync/sync.module';
import { TiersModule } from '../admin/catalog/tiers/tiers.module';
import { StaffUsersModule } from '../users/staff-users.module';
import { WorkModule } from '../work/work.module';

@Module({
  imports: [
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    ApiTokensModule,
    CatalogModule,
    AdminCatalogModule,
    AttributesModule,
    DocumentsModule,
    PageModule,
    MediaModule,
    InquiryModule,
    SettingsModule,
    SyncModule,
    TiersModule,
    StaffUsersModule,
    ConsentAdminModule,
    DestructionModule,
    AccountModule,
    OrdersModule,
    AddressesModule,
    PartiesModule,
    WorkModule,
  ],
  // Global, because the refusals it restates come from the guards, which run
  // ahead of every route rather than inside any one module.
  providers: [{ provide: APP_FILTER, useClass: ContractErrorFilter }],
})
export class AppModule {}
