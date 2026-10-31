import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { adminMaintenanceContract } from '@b2b-catalog-platform/shared/admin/site';
import { Auth } from '../../auth/auth.decorator';
import { CurrentUser } from '../../auth/current-user.decorator';
import { MaintenanceSwitch } from './maintenance-switch';

@Controller()
export class AdminMaintenanceController {
  constructor(private readonly maintenance: MaintenanceSwitch) {}

  @Auth('admin')
  @Implement(adminMaintenanceContract.getMaintenance)
  getMaintenance() {
    return implement(adminMaintenanceContract.getMaintenance).handler(() =>
      this.maintenance.read(),
    );
  }

  @Auth('admin')
  @Implement(adminMaintenanceContract.setMaintenance)
  setMaintenance(@CurrentUser() user: AuthUser) {
    return implement(adminMaintenanceContract.setMaintenance).handler(
      ({ input: { body } }) => this.maintenance.set(body.enabled, user),
    );
  }
}
