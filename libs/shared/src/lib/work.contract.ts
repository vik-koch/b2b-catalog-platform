import { oc } from '@orpc/contract';
import * as z from 'zod';
import { commonAuthErrors } from './api-error';

/**
 * What is waiting, per queue (FR-WORK-02). One endpoint answers the whole map
 * and the map is shaped by the asker's role (FR-WORK-04): a key is **absent**
 * where the account may not act on that queue, and `0` where it may and there
 * is nothing to do. Absent and zero are different answers — one says "not your
 * work", the other "no work" — and the panel draws neither.
 *
 * Every figure is a `COUNT` over state that is already there (ADR 0046), so
 * nothing here is stored, acknowledged or dismissed: a count clears when the
 * work behind it is done and not before.
 */
export const workCountsSchema = z.object({
  /** Registrations awaiting approval. Staff. */
  registrations: z.number().int().nonnegative().optional(),
  /** Orders nobody has answered yet. Staff. */
  orders: z.number().int().nonnegative().optional(),
  /** Products off the storefront awaiting review. Admin. */
  unpublishedProducts: z.number().int().nonnegative().optional(),
  /** The account holder's own orders that wait on them. */
  myOrders: z.number().int().nonnegative().optional(),
});
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
