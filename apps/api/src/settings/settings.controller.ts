import { Controller } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
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
  @TsRestHandler(settingsContract.checkMaintenance, { validateResponses: true })
  async checkMaintenance() {
    return tsRestHandler(settingsContract.checkMaintenance, async () => {
      return {
        status: 200,
        body: { enabled: this.settings.isMaintenanceEnabled() },
      };
    });
  }

  @Auth('admin')
  @TsRestHandler(settingsContract.getMaintenance, { validateResponses: true })
  async getMaintenance() {
    return tsRestHandler(settingsContract.getMaintenance, async () => {
      return { status: 200, body: await this.settings.getMaintenance() };
    });
  }

  @Auth('admin')
  @TsRestHandler(settingsContract.setMaintenance, { validateResponses: true })
  async setMaintenance(@CurrentUser() user: AuthUser) {
    return tsRestHandler(
      settingsContract.setMaintenance,
      async ({ body: { enabled } }) => {
        const status = await this.settings.setMaintenance(enabled, user.id);
        return { status: 200, body: status };
      },
    );
  }
}
