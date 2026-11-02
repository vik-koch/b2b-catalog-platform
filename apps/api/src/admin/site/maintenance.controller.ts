import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { adminMaintenanceContract } from '@b2b-catalog-platform/shared/admin/site';
import { Auth } from '../../platform/auth/auth.decorator';
import { CurrentUser } from '../../platform/auth/current-user.decorator';
import { MaintenanceSwitch } from './maintenance-switch';
import { AuthUser } from '@b2b-catalog-platform/shared/platform';

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
