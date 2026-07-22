import { Module } from '@nestjs/common';
import { InquiryModule } from '../inquiry/inquiry.module';
import { DatabaseModule } from '../db/database.module';
import { PageModule } from '../pages/page.module';
import { ThrottlingModule } from '../throttling/throttling.module';

@Module({
  imports: [ThrottlingModule, DatabaseModule, PageModule, InquiryModule],
})
export class AppModule {}
