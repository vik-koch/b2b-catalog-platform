import { Controller } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { machineCatalogSyncContract } from '@b2b-catalog-platform/shared';
import { CurrentMachine } from '../api-tokens/current-machine.decorator';
import { Machine } from '../api-tokens/machine.decorator';
import { MachineClient } from '../api-tokens/machine-client';
import { refusals } from '../orpc/refusals';
import { MachineThrottle } from '../throttling/throttle-presets';
import { CatalogSyncService } from './catalog-sync.service';
import { SyncRunLog } from './sync-run-log';

/**
 * The headless catalog sync (FR-ADM-07): what an automated client reaches with
 * its token alone.
 *
 * Its own controller because the guard is declared at class level and the two
 * authentication paths must not share one — a route added here can never
 * acquire a session, and a route added to `CatalogSyncController` can never
 * acquire a token. Behind it sits the same engine the upload uses: one importer, two
 * entry points.
 *
 * Notably absent: a commit route. An automated client never applies a run —
 * either the deployment's policy applied it, or an admin will. Reading one
 * back is here, though: knowing that a person has yet to answer is not the
 * same power as answering for them.
 */
@Machine('catalog-sync')
@MachineThrottle()
@Controller()
export class MachineSyncController {
  constructor(
    private readonly service: CatalogSyncService,
    // The read-back reaches past the importer to the run log itself: what
    // became of a run is the same question in every area, and routing it
    // through each area's service would be two copies of one lookup.
    private readonly runs: SyncRunLog,
  ) {}

  @Implement(machineCatalogSyncContract.submitRun)
  submitRun(@CurrentMachine() machine: MachineClient) {
    return (
      implement(machineCatalogSyncContract.submitRun)
        // Both routes refuse while nobody has handed the catalog over
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

  @Implement(machineCatalogSyncContract.reportFailure)
  reportFailure(@CurrentMachine() machine: MachineClient) {
    return implement(machineCatalogSyncContract.reportFailure)
      .use(refusals)
      .handler(({ input }) =>
        this.service.reportFailure(input.body, {
          id: machine.id,
          name: machine.name,
        }),
      );
  }

  @Implement(machineCatalogSyncContract.getRun)
  getRun() {
    return implement(machineCatalogSyncContract.getRun)
      .use(refusals)
      .handler(async ({ input: { params } }) => ({
        // The area comes from the class's own scope, not from the caller:
        // there is no request field here that could widen what this token
        // reaches.
        run: await this.runs.findForMachine(params.id, 'catalog'),
      }));
  }
}
