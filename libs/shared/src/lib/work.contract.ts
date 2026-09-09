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
  /**
   * Documents whose expiry has already passed (FR-DOC-04). Admin. Apart from
   * the ones about to expire because the two are read differently — an
   * expired certificate is the shop out of compliance now, an expiring one is
   * notice — and because each links to its own filter on the document list.
   */
  expiredDocuments: z.number().int().nonnegative().optional(),
  /** Documents inside the warning window (FR-DOC-04). Admin. */
  expiringDocuments: z.number().int().nonnegative().optional(),
  /**
   * Orders finished with the money not recorded (FR-ORD-04). Staff. Its own
   * queue rather than a second reading of `orders`: they are two jobs with two
   * lists, and one figure over both could not link to either.
   */
  unpaidOrders: z.number().int().nonnegative().optional(),
  /**
   * The account holder's own orders the shop is waiting to be paid for.
   * Its own queue rather than half of one figure: paying an invoice and
   * collecting a parcel are two jobs with two lists, and one count over both
   * could link to neither. An order that is both is counted in both.
   */
  myPayments: z.number().int().nonnegative().optional(),
  /** The account holder's own orders packed and waiting to be collected. */
  myPickups: z.number().int().nonnegative().optional(),
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
