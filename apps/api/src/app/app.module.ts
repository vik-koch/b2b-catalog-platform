import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module';
import { AttributesModule } from '../attributes/attributes.module';
import { AuthModule } from '../auth/auth.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PageModule } from '../pages/page.module';
import { MediaModule } from '../media/media.module';
import { ThrottlingModule } from '../throttling/throttling.module';
import { SettingsModule } from '../settings/settings.module';
import { SyncModule } from '../sync/sync.module';
import { TiersModule } from '../tiers/tiers.module';
import { StaffUsersModule } from '../users/staff-users.module';

@Module({
  imports: [
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    AttributesModule,
    PageModule,
    MediaModule,
    InquiryModule,
    SettingsModule,
    SyncModule,
    TiersModule,
    StaffUsersModule,
    AccountModule,
  ],
})
export class AppModule {}
