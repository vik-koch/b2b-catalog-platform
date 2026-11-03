import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  customerSyncSubmissionSchema,
  customerSyncSubmitResponseSchema,
} from '../../core/exchange/customer-sync.contract';
import { machineAuthErrors } from '../../core/exchange/machine-auth.contract';
import {
  machineRunErrors,
  machineSyncRunSchema,
  syncFailureReportSchema,
  syncRunSchema,
} from '../../core/exchange/sync-run.contract';
import { ownershipErrors } from '../../platform/ownership';

/** Token only, with its own scope; refused while the shop keeps the accounts
 * itself. */
const machine = oc.errors({
  ...machineAuthErrors,
  'customers-not-externally-owned':
    ownershipErrors['customers-not-externally-owned'],
});

/** Not gated on ownership, as on the catalog's. */
const machineRead = oc.errors(machineAuthErrors);

/** Its own paths, not an `area` field on the catalog's: the guard checks a
 * route's one scope before the body is read. No commit route, as on the
 * catalog's. */
export const machineCustomerSyncContract = {
  submitRun: machine
    .route({
      method: 'POST',
      path: '/machine/sync/customers/runs',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Submit customer accounts (machine)',
    })
    .input(z.object({ body: customerSyncSubmissionSchema }))
    .output(customerSyncSubmitResponseSchema),

  /** What became of a customer run (FR-ADM-09); a catalog run's id is not
   * found here. */
  getRun: machineRead
    .route({
      method: 'GET',
      path: '/machine/sync/customers/runs/{id}',
      inputStructure: 'detailed',
      summary: 'Read back one customer run (machine)',
    })
    .errors(machineRunErrors)
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ run: machineSyncRunSchema }).strict()),

  /** A run that never happened, so a broken feed is not silence. */
  reportFailure: machine
    .route({
      method: 'POST',
      path: '/machine/sync/customers/failures',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Record a customer run that failed before it began (machine)',
    })
    .input(z.object({ body: syncFailureReportSchema }))
    .output(z.object({ run: syncRunSchema }).strict()),
};
