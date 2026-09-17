import { NotFoundException } from '@nestjs/common';
import { SyncRunStatus } from '@b2b-catalog-platform/shared';

/** The person behind a run — an upload, or the decision on a staged one. */
export interface Actor {
  id: string;
  email: string;
}

/** The automated client behind a headless run. Never an `Actor`: there is no
 * person here, and nothing that reads one should be able to read this. */
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

/**
 * Why a run that is not `previewed` cannot be acted on. One sentence each,
 * rather than one code carrying the status: "already done", "it went wrong",
 * "a newer one replaced it" and "you said no to it" are four different things
 * for an admin to read.
 */
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
