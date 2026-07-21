import { Module } from '@nestjs/common';
import { ContactModule } from '../contact/contact.module';
import { DatabaseModule } from '../db/database.module';
import { PageModule } from '../pages/page.module';

@Module({
  imports: [DatabaseModule, PageModule, ContactModule],
})
export class AppModule {}
