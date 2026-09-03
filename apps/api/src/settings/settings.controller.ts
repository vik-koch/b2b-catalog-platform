import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, settingsContract } from '@b2b-catalog-platform/shared';
import { Auth } from '../auth/auth.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { SettingsService } from './settings.service';
import { MaintenanceExempt } from './maintenance-exempt.decorator';

@Controller()
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  // Public and gate-exempt: the storefront asks this to decide whether to show
  // the maintenance screen, so it must answer even while the gate is on.
  @MaintenanceExempt()
  @Implement(settingsContract.checkMaintenance)
  checkMaintenance() {
    return implement(settingsContract.checkMaintenance).handler(async () => ({
      enabled: this.settings.isMaintenanceEnabled(),
    }));
  }

  // Managers reach the admin panel too, and "what is deployed" is not an admin
  // secret — it is the first thing either role needs when reporting a problem.
  @Auth('admin', 'manager')
  @Implement(settingsContract.getBuildInfo)
  getBuildInfo() {
    return implement(settingsContract.getBuildInfo).handler(async () =>
      this.settings.getBuildInfo(),
    );
  }

  @Auth('admin')
  @Implement(settingsContract.getMaintenance)
  getMaintenance() {
    return implement(settingsContract.getMaintenance).handler(() =>
      this.settings.getMaintenance(),
    );
  }

  @Auth('admin')
  @Implement(settingsContract.setMaintenance)
  setMaintenance(@CurrentUser() user: AuthUser) {
    return implement(settingsContract.setMaintenance).handler(
      ({ input: { body } }) =>
        this.settings.setMaintenance(body.enabled, user.id),
    );
  }
}
