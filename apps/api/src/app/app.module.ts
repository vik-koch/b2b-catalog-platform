import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ContractErrorFilter } from '../orpc/contract-error.filter';
import { AccountModule } from '../account/account.module';
import { AddressesModule } from '../addresses/addresses.module';
import { PartiesModule } from '../parties/parties.module';
import { AttributesModule } from '../attributes/attributes.module';
import { AuthModule } from '../auth/auth.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DocumentsModule } from '../documents/documents.module';
import { OrdersModule } from '../orders/orders.module';
import { PageModule } from '../pages/page.module';
import { MediaModule } from '../media/media.module';
import { ThrottlingModule } from '../throttling/throttling.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncModule } from '../sync/sync.module';
import { TiersModule } from '../tiers/tiers.module';
import { StaffUsersModule } from '../users/staff-users.module';
import { WorkModule } from '../work/work.module';

@Module({
  imports: [
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    AttributesModule,
    DocumentsModule,
    PageModule,
    MediaModule,
    InquiryModule,
    SettingsModule,
    SyncModule,
    TiersModule,
    StaffUsersModule,
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
