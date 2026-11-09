import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';

import { machineOrderSyncContract } from '@b2b-catalog-platform/shared/machine/exchange';

import { ExchangeMachine } from '../../core/exchange/api-token-lookup';
import { SyncRunLog } from '../../core/exchange/sync-run-log';
import { CurrentMachine } from '../../platform/auth/current-machine.decorator';
import { refusals } from '../../platform/orpc/refusals';
import { MachineThrottle } from '../../platform/throttling/throttle-presets';
import { Machine } from './machine.decorator';
import { OrderSyncService } from './order-sync.service';

/**
 * The order write-back (FR-ADM-08). `order-sync` is apart from `order-read`
 * because a system pulls orders for weeks before anybody lets it answer one.
 * No commit route: an order run is applied as it arrives.
 */
@Machine('order-sync')
@MachineThrottle()
@Controller()
export class MachineOrderSyncController {
  constructor(
    private readonly service: OrderSyncService,
    private readonly runs: SyncRunLog,
  ) {}

  @Implement(machineOrderSyncContract.submitRun)
  submitRun(@CurrentMachine() machine: ExchangeMachine) {
    return implement(machineOrderSyncContract.submitRun)
      .use(refusals)
      .handler(({ input }) => this.service.submit(input.body, machine));
  }

  @Implement(machineOrderSyncContract.getRun)
  getRun() {
    return implement(machineOrderSyncContract.getRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        run: await this.runs.findForMachine(params.id, 'orders'),
      }));
  }

  @Implement(machineOrderSyncContract.reportFailure)
  reportFailure(@CurrentMachine() machine: ExchangeMachine) {
    return implement(machineOrderSyncContract.reportFailure)
      .use(refusals)
      .handler(({ input }) => this.service.reportFailure(input.body, machine));
  }
}
