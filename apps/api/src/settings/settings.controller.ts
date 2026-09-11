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

  // One read for both switches: they are one row, one screen asks for them
  // together, and the write endpoints below answer with the same whole.
  @Auth('admin')
  @Implement(settingsContract.getSettings)
  getSettings() {
    return implement(settingsContract.getSettings).handler(() =>
      this.settings.getSettings(),
    );
  }

  @Auth('admin')
  @Implement(settingsContract.setMaintenance)
  setMaintenance(@CurrentUser() user: AuthUser) {
    return implement(settingsContract.setMaintenance).handler(
      ({ input: { body } }) => this.settings.setMaintenance(body.enabled, user),
    );
  }

  @Auth('admin')
  @Implement(settingsContract.setOwnership)
  setOwnership(@CurrentUser() user: AuthUser) {
    return implement(settingsContract.setOwnership).handler(
      ({ input: { body } }) =>
        this.settings.setOwnership(body.area, body.owned, user),
    );
  }

  @Auth('admin')
  @Implement(settingsContract.listSettingChanges)
  listSettingChanges() {
    return implement(settingsContract.listSettingChanges).handler(async () => ({
      changes: await this.settings.listChanges(),
    }));
  }
}
