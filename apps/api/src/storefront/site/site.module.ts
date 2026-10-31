import { Module } from '@nestjs/common';
import { PageController } from './page.controller';
import { PageService } from './page.service';

/** The storefront's pages, read in public. DatabaseModule is global, so
 * DRIZZLE needs no import. */
@Module({
  controllers: [PageController],
  providers: [PageService],
})
export class SiteModule {}
