import { Module } from '@nestjs/common';

import { SessionModule } from '../../platform/auth/session.module';
import { MaintenanceSwitch } from './maintenance-switch';
import { AdminMaintenanceController } from './maintenance.controller';
import { PageEditorService } from './page-editor.service';
import { AdminPagesController } from './pages.controller';

/** SessionModule supplies the `@Auth` guards. */
@Module({
  imports: [SessionModule],
  controllers: [AdminPagesController, AdminMaintenanceController],
  providers: [PageEditorService, MaintenanceSwitch],
})
export class AdminSiteModule {}
