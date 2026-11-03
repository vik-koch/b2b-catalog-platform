import { Module } from '@nestjs/common';
import { AdminPagesController } from './pages.controller';
import { PageEditorService } from './page-editor.service';
import { AdminMaintenanceController } from './maintenance.controller';
import { MaintenanceSwitch } from './maintenance-switch';
import { SessionModule } from '../../platform/auth/session.module';

/** SessionModule supplies the `@Auth` guards. */
@Module({
  imports: [SessionModule],
  controllers: [AdminPagesController, AdminMaintenanceController],
  providers: [PageEditorService, MaintenanceSwitch],
})
export class AdminSiteModule {}
