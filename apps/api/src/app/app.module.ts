import { Module } from '@nestjs/common';
import { DatabaseModule } from '../db/database.module';
import { PageModule } from '../pages/page.module';

@Module({
  imports: [DatabaseModule, PageModule],
})
export class AppModule {}
