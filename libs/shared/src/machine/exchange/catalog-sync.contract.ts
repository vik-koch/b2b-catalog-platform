import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  catalogSyncSubmissionSchema,
  catalogSyncSubmitResponseSchema,
} from '../../core/exchange/catalog-sync.contract';
import { machineAuthErrors } from '../../core/exchange/machine-auth.contract';
import {
  machineRunErrors,
  machineSyncRunSchema,
  syncFailureReportSchema,
  syncRunSchema,
} from '../../core/exchange/sync-run.contract';
import { ownershipErrors } from '../../platform/ownership-constants';

/** Token only; refused while the shop writes the catalog itself. */
const machine = oc.errors({
  ...machineAuthErrors,
  'catalog-not-externally-owned':
    ownershipErrors['catalog-not-externally-owned'],
});

/** Not gated on ownership: a source refused after a hand-back most needs to
 * read why. */
const machineRead = oc.errors(machineAuthErrors);

/** No commit route: a run applies itself within the policy, or a person
 * applies it. */
export const machineCatalogSyncContract = {
  submitRun: machine
    .route({
      method: 'POST',
      path: '/machine/sync/runs',
      // A run is created whichever way the policy decides.
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Submit a catalog import (machine)',
    })
    .input(z.object({ body: catalogSyncSubmissionSchema }))
    .output(catalogSyncSubmitResponseSchema),

  /** A run that never happened, so a broken feed does not look like one
   * with nothing to send. */
  reportFailure: machine
    .route({
      method: 'POST',
      path: '/machine/sync/failures',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Record a run that failed before it began (machine)',
    })
    .input(z.object({ body: syncFailureReportSchema }))
    .output(z.object({ run: syncRunSchema }).strict()),

  /** What became of a run (FR-ADM-09): a staged run is superseded by the
   * next submission, so a source learns here to wait for a person. Scoped to
   * the token's area, not the token: a rotated token is the same source. */
  getRun: machineRead
    .route({
      method: 'GET',
      path: '/machine/sync/runs/{id}',
      inputStructure: 'detailed',
      summary: 'Read back one catalog run (machine)',
    })
    .errors(machineRunErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ run: machineSyncRunSchema }).strict()),
};
