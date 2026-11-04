import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from '../../lib/core/api-error';
import { WORK_QUEUES } from './work';

/**
 * What waits, per queue (FR-WORK-02). A key is absent where the account may
 * not act on that queue (FR-WORK-04) and `0` where there is nothing to do.
 */
export const workCountsSchema = z.partialRecord(
  z.enum(WORK_QUEUES),
  z.number().int().nonnegative(),
);
export type WorkCounts = z.infer<typeof workCountsSchema>;

export const workContract = {
  getCounts: oc
    .route({
      method: 'GET',
      path: '/work/counts',
      summary: 'What awaits the signed-in account, per queue',
    })
    .errors(commonAuthErrors)
    .output(workCountsSchema),
};
