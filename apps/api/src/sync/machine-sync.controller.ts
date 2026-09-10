import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineSyncContract } from '@b2b-catalog-platform/shared';
import { CurrentMachine } from '../api-tokens/current-machine.decorator';
import { Machine } from '../api-tokens/machine.decorator';
import { MachineClient } from '../api-tokens/machine-client';
import { MachineThrottle } from '../throttling/throttle-presets';
import { SyncService } from './sync.service';

/**
 * The headless catalog sync (FR-ADM-07): what an automated client reaches with
 * its token alone.
 *
 * Its own controller because the guard is declared at class level and the two
 * authentication paths must not share one — a route added here can never
 * acquire a session, and a route added to `SyncController` can never acquire a
 * token. Behind it sits the same engine the upload uses: one importer, two
 * entry points.
 *
 * Notably absent: a commit route. An automated client never applies a run —
 * either the deployment's policy applied it, or an admin will.
 */
@Machine('catalog-sync')
@MachineThrottle()
@Controller()
export class MachineSyncController {
  constructor(private readonly service: SyncService) {}

  @Implement(machineSyncContract.submitRun)
  submitRun(@CurrentMachine() machine: MachineClient) {
    return implement(machineSyncContract.submitRun).handler(({ input }) =>
      this.service.submit(input.body, { id: machine.id, name: machine.name }),
    );
  }

  @Implement(machineSyncContract.reportFailure)
  reportFailure(@CurrentMachine() machine: MachineClient) {
    return implement(machineSyncContract.reportFailure).handler(({ input }) =>
      this.service.reportFailure(input.body, {
        id: machine.id,
        name: machine.name,
      }),
    );
  }
}
