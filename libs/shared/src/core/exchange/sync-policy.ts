import * as z from 'zod';

import { SyncStagedReason, SyncSummary } from './sync-run.contract';

/** A handful of new categories is an export growing; a dozen is a
 * reorganisation worth reading first. */
const DEFAULT_MAX_CATEGORIES_CREATED = 5;

/** Zero, like deletions: an operator wanting it unattended writes the
 * number down. */
const DEFAULT_MAX_CATEGORIES_EMPTIED = 0;

/** When an automated catalog run applies itself (FR-ADM-07), judged by its
 * diff. Deployment config: what looks suspicious depends on the catalog. */
export const syncPolicySchema = z
  .object({
    /** Products this run may create before it needs a person. */
    maxCreates: z.number().int().nonnegative(),
    /** Products it may hide. */
    maxSoftDeletes: z.number().int().nonnegative(),
    /** The share of the live catalog one run may touch, 0 to 1: catches a
     * wrongly filtered export no absolute ceiling notices. */
    maxChangedShare: z.number().min(0).max(1),
    /** Categories it may add. Defaulted, like the next, so an older
     * deployment's policy still loads. */
    maxCategoriesCreated: z
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_MAX_CATEGORIES_CREATED),
    /** Categories it may leave empty: a regrouping shows here even when every
     * product survives. */
    maxCategoriesEmptied: z
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_MAX_CATEGORIES_EMPTIED),
  })
  .strict();
export type SyncPolicy = z.infer<typeof syncPolicySchema>;

/** Loose, as a standing queue nobody reads is worse than no policy, except
 * hiding products and emptying categories. */
export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  maxCreates: 100,
  maxSoftDeletes: 0,
  maxChangedShare: 0.5,
  maxCategoriesCreated: DEFAULT_MAX_CATEGORIES_CREATED,
  maxCategoriesEmptied: DEFAULT_MAX_CATEGORIES_EMPTIED,
};

/** Null to apply, or why not; `requested` outranks `policy`. An empty
 * catalog scores no share: the creates ceiling judges a first import. */
export function decideAutoApply(
  summary: SyncSummary,
  liveProducts: number,
  policy: SyncPolicy,
  requestReview: boolean,
): SyncStagedReason | null {
  if (requestReview) return 'requested';
  if (summary.create > policy.maxCreates) return 'policy';
  if (summary.softDelete > policy.maxSoftDeletes) return 'policy';
  if (summary.categoriesCreated > policy.maxCategoriesCreated) return 'policy';
  if (summary.categoriesEmptied > policy.maxCategoriesEmptied) return 'policy';

  const changed =
    summary.create + summary.update + summary.softDelete + summary.restore;
  const share = liveProducts === 0 ? 0 : changed / liveProducts;
  if (share > policy.maxChangedShare) return 'policy';

  return null;
}

/** A feed's ordinary night is one or two people. */
const DEFAULT_MAX_INVITES = 25;

const DEFAULT_MAX_DISABLES = 0;

/** Zero: a mistyped address upstream would take over a real customer's
 * account in a run nobody read. */
const DEFAULT_MAX_CLAIMS = 0;

/** Zero too: an id nobody typed can still sit in a wrong mapping upstream.
 * Its own number, so a deployment may trust ids and not addresses. */
const DEFAULT_MAX_ID_CLAIMS = 0;

/** When an automated customer run applies itself (FR-ADM-11). No share
 * ceiling: an ordinary run touches a handful of people. */
export const customerSyncPolicySchema = z
  .object({
    /** Each invite is a mail to somebody. */
    maxInvites: z.number().int().nonnegative().default(DEFAULT_MAX_INVITES),
    /** Zero by default, like `maxSoftDeletes`. */
    maxDisables: z.number().int().nonnegative().default(DEFAULT_MAX_DISABLES),
    /** Claims by address. */
    maxClaims: z.number().int().nonnegative().default(DEFAULT_MAX_CLAIMS),
    /** Claims by the platform's id. */
    maxIdClaims: z.number().int().nonnegative().default(DEFAULT_MAX_ID_CLAIMS),
  })
  .strict();
export type CustomerSyncPolicy = z.infer<typeof customerSyncPolicySchema>;

export const DEFAULT_CUSTOMER_SYNC_POLICY: CustomerSyncPolicy = {
  maxInvites: DEFAULT_MAX_INVITES,
  maxDisables: DEFAULT_MAX_DISABLES,
  maxClaims: DEFAULT_MAX_CLAIMS,
  maxIdClaims: DEFAULT_MAX_ID_CLAIMS,
};

/** As `decideAutoApply`. Requested links are not counted: they go to the
 * account's own address, at a person's request upstream. */
export function decideCustomerAutoApply(
  summary: SyncSummary,
  policy: CustomerSyncPolicy,
  requestReview: boolean,
): SyncStagedReason | null {
  if (requestReview) return 'requested';
  if (summary.create > policy.maxInvites) return 'policy';
  if (summary.softDelete > policy.maxDisables) return 'policy';
  if (summary.claimed > policy.maxClaims) return 'policy';
  if (summary.claimedById > policy.maxIdClaims) return 'policy';
  return null;
}
