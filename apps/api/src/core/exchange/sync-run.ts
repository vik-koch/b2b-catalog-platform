import { NotFoundException } from '@nestjs/common';
import { SyncRunStatus } from '@b2b-catalog-platform/shared/core/exchange';
import { Database } from '../../platform/db/database';

/** The handle a `db.transaction` callback gets. */
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The pool or a transaction on it, for a read either may run. */
export type Reader = Pick<Database, 'select'>;

/** The person behind a run: an upload, or the decision on a staged one. */
export interface Actor {
  id: string;
  email: string;
}

/** The automated client behind a headless run; never an `Actor`, so nothing
 * that reads a person can read it. */
export interface Submitter {
  id: string;
  name: string;
}

/** The one 404 here; a function so each throw gets its own stack. */
export const runNotFound = () =>
  new NotFoundException({
    code: 'run-not-found',
    message: 'Sync run not found',
  });

/** Why a run that is not `previewed` cannot be acted on: a code per status,
 * as each reads as a different sentence to an admin. */
export const CONFLICT_CODE: Record<
  Exclude<SyncRunStatus, 'previewed'>,
  string
> = {
  applied: 'run-already-applied',
  failed: 'run-failed',
  'no-change': 'run-no-change',
  superseded: 'run-superseded',
  discarded: 'run-discarded',
};
