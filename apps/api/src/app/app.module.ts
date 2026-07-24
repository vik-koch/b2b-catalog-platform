import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InquiryModule } from '../inquiry/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { PageModule } from '../pages/page.module';
import { ThrottlingModule } from '../throttling/throttling.module';

@Module({
  imports: [
    ThrottlingModule,
    DatabaseModule,
    AuthModule,
    PageModule,
    InquiryModule,
  ],
})
export class AppModule {}
