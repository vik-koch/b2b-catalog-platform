import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

import { ConsentAdminModule } from '../admin/accounts/consent-admin.module';
import { StaffUsersModule } from '../admin/accounts/staff-users.module';
import { AdminCatalogModule } from '../admin/catalog/admin-catalog.module';
import { AdminExchangeModule } from '../admin/exchange/admin-exchange.module';
import { AdminOrderingModule } from '../admin/ordering/admin-ordering.module';
import { AdminPlatformModule } from '../admin/platform/admin-platform.module';
import { AdminSiteModule } from '../admin/site/admin-site.module';
import { RetentionModule } from '../core/retention/retention.module';
import { SiteCoreModule } from '../core/site/site-core.module';
import { WorkModule } from '../core/work/work.module';
import { MachineExchangeModule } from '../machine/exchange/machine-exchange.module';
import { DatabaseModule } from '../platform/db/database.module';
import { ContractErrorFilter } from '../platform/orpc/contract-error.filter';
import { SettingsStoreModule } from '../platform/settings/settings-store.module';
import { ThrottlingModule } from '../platform/throttling/throttling.module';
import { AccountModule } from '../storefront/accounts/account.module';
import { AddressesModule } from '../storefront/accounts/addresses.module';
import { AuthModule } from '../storefront/accounts/auth.module';
import { PartiesModule } from '../storefront/accounts/parties.module';
import { CatalogModule } from '../storefront/catalog/catalog.module';
import { OrderingModule } from '../storefront/ordering/ordering.module';
import { InquiryModule } from '../storefront/site/inquiry.module';
import { SiteModule } from '../storefront/site/site.module';
import { AccountErasureModule } from './account-erasure.module';
import { AreaPortsModule } from './area-ports.module';
import { TextsModule } from './texts.module';

@Module({
  imports: [
    TextsModule,
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    AdminCatalogModule,
    SiteModule,
    AdminSiteModule,
    InquiryModule,
    SettingsStoreModule,
    SiteCoreModule,
    AdminPlatformModule,
    AdminExchangeModule,
    MachineExchangeModule,
    StaffUsersModule,
    ConsentAdminModule,
    RetentionModule,
    AccountErasureModule,
    AreaPortsModule,
    AccountModule,
    OrderingModule,
    AdminOrderingModule,
    AddressesModule,
    PartiesModule,
    WorkModule,
  ],
  // Global, because the refusals it restates come from the guards, which run
  // ahead of every route rather than inside any one module.
  providers: [{ provide: APP_FILTER, useClass: ContractErrorFilter }],
})
export class AppModule {}
