import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineCustomerSyncContract } from '@b2b-catalog-platform/shared';
import { CurrentMachine } from '../api-tokens/current-machine.decorator';
import { Machine } from '../api-tokens/machine.decorator';
import { MachineClient } from '../api-tokens/machine-client';
import { refusals } from '../orpc/refusals';
import { MachineThrottle } from '../throttling/throttle-presets';
import { CustomerSyncService } from './customer-sync.service';
import { SyncRunLog } from './sync-run-log';

/**
 * The headless customer exchange (FR-ADM-11): what an automated client reaches
 * with its token alone.
 *
 * Its own controller for the reason the catalog's is one, and then some. The
 * guard is declared at class level, so the two authentication paths cannot
 * share a controller — and here the **scope** is declared at class level too.
 * `customer-sync` is a separate capability from `catalog-sync`: a credential
 * that receives a price list has no business inviting people into accounts or
 * taking their sign-in away, and an operator who wants one token to do both
 * ticks both boxes on it.
 *
 * Notably absent, exactly as next door: a commit route. An automated client
 * never applies a run — either the deployment's policy applied it, or a person
 * will.
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
  submitRun(@CurrentMachine() machine: MachineClient) {
    return (
      implement(machineCustomerSyncContract.submitRun)
        // Both routes refuse while nobody has handed customer accounts over
        // (FR-ADM-10). Without this the service's exception is swallowed and
        // answered as a 500 with the code gone — see `refusals`.
        .use(refusals)
        .handler(({ input }) =>
          this.service.submit(input.body, {
            id: machine.id,
            name: machine.name,
          }),
        )
    );
  }

  @Implement(machineCustomerSyncContract.reportFailure)
  reportFailure(@CurrentMachine() machine: MachineClient) {
    return implement(machineCustomerSyncContract.reportFailure)
      .use(refusals)
      .handler(({ input }) =>
        this.service.reportFailure(input.body, {
          id: machine.id,
          name: machine.name,
        }),
      );
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
