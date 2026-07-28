import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { CatalogModule } from '../catalog/catalog.module';
import { PageModule } from '../pages/page.module';
import { MediaModule } from '../media/media.module';
import { ThrottlingModule } from '../throttling/throttling.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    CatalogModule,
    PageModule,
    MediaModule,
    InquiryModule,
    SettingsModule,
  ],
})
export class AppModule {}
