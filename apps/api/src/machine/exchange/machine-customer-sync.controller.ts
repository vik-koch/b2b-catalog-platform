import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineCustomerSyncContract } from '@b2b-catalog-platform/shared/machine/exchange';
import { CustomerSyncService } from '../../core/exchange/customer-sync.service';
import { SyncRunLog } from '../../core/exchange/sync-run-log';
import { refusals } from '../../platform/orpc/refusals';
import { CurrentMachine } from '../../platform/auth/current-machine.decorator';
import { ExchangeMachine } from '../../core/exchange/api-token-lookup';
import { Machine } from './machine.decorator';
import { MachineThrottle } from '../../platform/throttling/throttle-presets';

/**
 * The headless customer exchange (FR-ADM-11). Its own scope: a credential
 * that receives a price list has no business inviting people into accounts.
 * No commit route, as for the catalog.
 */
@Machine('customer-sync')
@MachineThrottle()
@Controller()
export class MachineCustomerSyncController {
  constructor(
    private readonly service: CustomerSyncService,
    private readonly runs: SyncRunLog,
  ) {}

  @Implement(machineCustomerSyncContract.submitRun)
  submitRun(@CurrentMachine() machine: ExchangeMachine) {
    return implement(machineCustomerSyncContract.submitRun)
      .use(refusals)
      .handler(({ input }) => this.service.submit(input.body, machine));
  }

  @Implement(machineCustomerSyncContract.reportFailure)
  reportFailure(@CurrentMachine() machine: ExchangeMachine) {
    return implement(machineCustomerSyncContract.reportFailure)
      .use(refusals)
      .handler(({ input }) => this.service.reportFailure(input.body, machine));
  }

  @Implement(machineCustomerSyncContract.getRun)
  getRun() {
    return implement(machineCustomerSyncContract.getRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        run: await this.runs.findForMachine(params.id, 'customers'),
      }));
  }
}
