import { Module } from '@nestjs/common';

import { MaintenanceStateModule } from '../../core/site/maintenance-state.module';
import { MaintenanceController } from './maintenance.controller';
import { PageController } from './page.controller';
import { PageService } from './page.service';

@Module({
  imports: [MaintenanceStateModule],
  controllers: [PageController, MaintenanceController],
  providers: [PageService],
})
export class SiteModule {}
