import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { maintenanceContract } from '@b2b-catalog-platform/shared/core/site';
import { MaintenanceExempt } from '../../core/site/maintenance-exempt.decorator';
import { MaintenanceState } from '../../core/site/maintenance-state';

@Controller()
export class MaintenanceController {
  constructor(private readonly maintenance: MaintenanceState) {}

  // Public and gate-exempt: the storefront asks this to decide whether to show
  // the maintenance screen, so it must answer even while the gate is on.
  @MaintenanceExempt()
  @Implement(maintenanceContract.checkMaintenance)
  checkMaintenance() {
    return implement(maintenanceContract.checkMaintenance).handler(
      async () => ({ enabled: this.maintenance.isEnabled() }),
    );
  }
}
