import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { AuthUser, settingsContract } from '@b2b-catalog-platform/shared';
import { adminSettingsContract } from '@b2b-catalog-platform/shared/admin';
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
  @Implement(adminSettingsContract.getBuildInfo)
  getBuildInfo() {
    return implement(adminSettingsContract.getBuildInfo).handler(async () =>
      this.settings.getBuildInfo(),
    );
  }

  // One read for both switches: they are one row, one screen asks for them
  // together, and the write endpoints below answer with the same whole.
  @Auth('admin')
  @Implement(adminSettingsContract.getSettings)
  getSettings() {
    return implement(adminSettingsContract.getSettings).handler(() =>
      this.settings.getSettings(),
    );
  }

  @Auth('admin')
  @Implement(adminSettingsContract.setMaintenance)
  setMaintenance(@CurrentUser() user: AuthUser) {
    return implement(adminSettingsContract.setMaintenance).handler(
      ({ input: { body } }) => this.settings.setMaintenance(body.enabled, user),
    );
  }

  @Auth('admin')
  @Implement(adminSettingsContract.setOwnership)
  setOwnership(@CurrentUser() user: AuthUser) {
    return implement(adminSettingsContract.setOwnership).handler(
      ({ input: { body } }) =>
        this.settings.setOwnership(body.areas, body.owned, user),
    );
  }

  @Auth('admin')
  @Implement(adminSettingsContract.listSettingChanges)
  listSettingChanges() {
    return implement(adminSettingsContract.listSettingChanges).handler(
      async () => ({
        changes: await this.settings.listChanges(),
      }),
    );
  }
}
