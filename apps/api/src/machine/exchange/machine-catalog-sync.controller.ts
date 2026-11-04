import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineCatalogSyncContract } from '@b2b-catalog-platform/shared/machine/exchange';
import { CatalogSyncService } from '../../core/exchange/catalog-sync.service';
import { SyncRunLog } from '../../core/exchange/sync-run-log';
import { refusals } from '../../platform/orpc/refusals';
import { CurrentMachine } from '../../platform/auth/current-machine.decorator';
import { MachineClient } from '../../platform/auth/machine-client';
import { Machine } from '../../platform/auth/machine.decorator';
import { MachineThrottle } from '../../platform/throttling/throttle-presets';

/**
 * The headless catalog sync (FR-ADM-07), on the upload's engine. No commit
 * route: the deployment's policy applies a run, or a person does.
 */
@Machine('catalog-sync')
@MachineThrottle()
@Controller()
export class MachineCatalogSyncController {
  constructor(
    private readonly service: CatalogSyncService,
    private readonly runs: SyncRunLog,
  ) {}

  @Implement(machineCatalogSyncContract.submitRun)
  submitRun(@CurrentMachine() machine: MachineClient) {
    return implement(machineCatalogSyncContract.submitRun)
      .use(refusals)
      .handler(({ input }) => this.service.submit(input.body, machine));
  }

  @Implement(machineCatalogSyncContract.reportFailure)
  reportFailure(@CurrentMachine() machine: MachineClient) {
    return implement(machineCatalogSyncContract.reportFailure)
      .use(refusals)
      .handler(({ input }) => this.service.reportFailure(input.body, machine));
  }

  @Implement(machineCatalogSyncContract.getRun)
  getRun() {
    return implement(machineCatalogSyncContract.getRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        // The area is the class's scope, never a request field.
        run: await this.runs.findForMachine(params.id, 'catalog'),
      }));
  }
}
