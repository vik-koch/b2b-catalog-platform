import { Module } from '@nestjs/common';
import { PageController } from './page.controller';
import { PageService } from './page.service';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceStateModule } from '../../core/site/maintenance-state.module';

/** The storefront's pages and maintenance check, read in public.
 * DatabaseModule is global, so DRIZZLE needs no import. */
@Module({
  imports: [MaintenanceStateModule],
  controllers: [PageController, MaintenanceController],
  providers: [PageService],
})
export class SiteModule {}
