import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineOrderSyncContract } from '@b2b-catalog-platform/shared';
import { CurrentMachine } from '../api-tokens/current-machine.decorator';
import { Machine } from '../api-tokens/machine.decorator';
import { MachineClient } from '../api-tokens/machine-client';
import { refusals } from '../orpc/refusals';
import { MachineThrottle } from '../throttling/throttle-presets';
import { OrderSyncService } from './order-sync.service';
import { SyncRunLog } from './sync-run-log';

/**
 * The order write-back (FR-ADM-08): what an automated client reaches with its
 * token alone.
 *
 * Its own controller and its own capability, as every machine surface here is:
 * the guard names one thing per class and checks it before the body is read.
 * `order-sync` is the pen — moving orders, changing what they say, recording
 * the money — and it is deliberately not `order-read` beside it, because a
 * system pulls orders for weeks before anybody lets it answer one.
 *
 * No commit route, exactly as next door: an order run is applied as it
 * arrives (ADR 0062), so there is nothing here for anybody to press.
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
  submitRun(@CurrentMachine() machine: MachineClient) {
    return (
      implement(machineOrderSyncContract.submitRun)
        // The ownership refusal travels as its code rather than as a 500 with
        // the code stripped off — see `refusals`.
        .use(refusals)
        .handler(({ input }) =>
          this.service.submit(input.body, {
            id: machine.id,
            name: machine.name,
          }),
        )
    );
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
  reportFailure(@CurrentMachine() machine: MachineClient) {
    return implement(machineOrderSyncContract.reportFailure)
      .use(refusals)
      .handler(({ input }) =>
        this.service.reportFailure(input.body, {
          id: machine.id,
          name: machine.name,
        }),
      );
  }
}
