import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { AccountModule } from '../storefront/accounts/account.module';
import { ApiTokensModule } from '../api-tokens/api-tokens.module';
import { AddressesModule } from '../storefront/accounts/addresses.module';
import { PartiesModule } from '../storefront/accounts/parties.module';
import { AuthModule } from '../storefront/accounts/auth.module';
import { ConsentAdminModule } from '../admin/accounts/consent-admin.module';
import { InquiryModule } from '../storefront/site/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { AccountErasureModule } from './account-erasure.module';
import { DestructionModule } from '../destruction/destruction.module';
import { CatalogModule } from '../storefront/catalog/catalog.module';
import { AdminCatalogModule } from '../admin/catalog/admin-catalog.module';
import { OrdersModule } from '../core/ordering/orders.module';
import { SiteModule } from '../storefront/site/site.module';
import { AdminSiteModule } from '../admin/site/admin-site.module';
import { MediaModule } from '../media/media.module';
import { ThrottlingModule } from '../throttling/throttling.module';
import { SettingsStoreModule } from '../platform/settings/settings-store.module';
import { SiteCoreModule } from '../core/site/site-core.module';
import { OwnershipModule } from '../settings/ownership.module';
import { AdminPlatformModule } from '../admin/platform/admin-platform.module';
import { SyncModule } from '../sync/sync.module';
import { StaffUsersModule } from '../admin/accounts/staff-users.module';
import { WorkModule } from '../work/work.module';

@Module({
  imports: [
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    ApiTokensModule,
    CatalogModule,
    AdminCatalogModule,
    SiteModule,
    AdminSiteModule,
    MediaModule,
    InquiryModule,
    SettingsStoreModule,
    SiteCoreModule,
    OwnershipModule,
    AdminPlatformModule,
    SyncModule,
    StaffUsersModule,
    ConsentAdminModule,
    DestructionModule,
    AccountErasureModule,
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
