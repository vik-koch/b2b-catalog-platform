import { Module } from '@nestjs/common';
import { AdminPagesController } from './pages.controller';
import { PageEditorService } from './page-editor.service';
import { AdminMaintenanceController } from './maintenance.controller';
import { MaintenanceSwitch } from './maintenance-switch';
import { AuthModule } from '../../auth/auth.module';

/** The admin's page editor and maintenance toggle, behind the `@Auth` guards
 * AuthModule supplies. */
@Module({
  imports: [AuthModule],
  controllers: [AdminPagesController, AdminMaintenanceController],
  providers: [PageEditorService, MaintenanceSwitch],
})
export class AdminSiteModule {}
