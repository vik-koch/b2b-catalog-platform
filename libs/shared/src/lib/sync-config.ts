import * as z from 'zod';
import { SyncStagedReason, SyncSummary } from './sync.contract';

/**
 * When an automated catalog run applies itself (FR-ADM-07).
 *
 * A run is judged by its **effect**, not by its shape: the diff is computed
 * exactly as a manual upload's is, and these ceilings decide whether it is
 * committed there and then or left staged for an admin to read. A field
 * whitelist says what a run may touch, which is a statement about intent; a
 * diff says what it will do, which is the thing worth a person's attention.
 *
 * The numbers are deployment config because the right ones are a property of
 * the catalog rather than of the software — a shop adding two products a week
 * and one importing a seasonal range disagree about what a suspicious run is,
 * and neither should need a release to say so.
 */
/**
 * A handful of new groupings is an ordinary export growing; a dozen is a
 * reorganisation, and those are worth reading before they land.
 */
const DEFAULT_MAX_CATEGORIES_CREATED = 5;

/**
 * Zero for the same reason deletions are: it is an effect that takes part of
 * the storefront apart, and an operator who wants it unattended should have to
 * write the number down.
 */
const DEFAULT_MAX_CATEGORIES_EMPTIED = 0;

export const syncPolicySchema = z
  .object({
    /** Products this run may create before it needs a person. */
    maxCreates: z.number().int().nonnegative(),
    /**
     * Products it may hide. Zero is a reasonable value: a sweep that removes
     * anything is the case this whole mechanism exists for.
     */
    maxSoftDeletes: z.number().int().nonnegative(),
    /**
     * The share of the live catalog one run may touch, 0–1. Catches the export
     * that was filtered wrongly and now rewrites everything, which no absolute
     * ceiling notices in a catalog of a few hundred.
     */
    maxChangedShare: z.number().min(0).max(1),
    /**
     * Categories it may add. A feed that keeps adding groupings is either
     * reorganising upstream or keying them wrongly, and the diff cannot tell
     * the two apart — which is the argument for a person rather than a rule.
     *
     * Defaulted, like the ceiling below it, so a deployment that wrote its
     * policy down before these existed keeps loading.
     */
    maxCategoriesCreated: z
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_MAX_CATEGORIES_CREATED),
    /**
     * Categories it may leave empty, whether by moving their products or by
     * sweeping them. The counterpart to `maxSoftDeletes`: a product vanishing
     * and the group it was filed under vanishing are the same class of event
     * from the storefront's side, and a regrouping shows up here even when
     * every product survives and the share ceiling sees nothing.
     */
    maxCategoriesEmptied: z
      .number()
      .int()
      .nonnegative()
      .default(DEFAULT_MAX_CATEGORIES_EMPTIED),
  })
  .strict();
export type SyncPolicy = z.infer<typeof syncPolicySchema>;

/**
 * What a deployment that declares nothing gets: loose, except for deletions.
 *
 * Thresholds set too tight produce a standing queue of staged runs nobody
 * reads, which is worse than no policy at all — so the defaults let the boring
 * case through and are tightened once a deployment knows its own noise. The
 * exceptions are the two that take the storefront apart — hiding a product and
 * emptying a category — which stay at zero: an operator who wants either
 * unattended should have to write the number down.
 */
export const DEFAULT_SYNC_POLICY: SyncPolicy = {
  maxCreates: 100,
  maxSoftDeletes: 0,
  maxChangedShare: 0.5,
  maxCategoriesCreated: DEFAULT_MAX_CATEGORIES_CREATED,
  maxCategoriesEmptied: DEFAULT_MAX_CATEGORIES_EMPTIED,
};

/**
 * Whether a run applies itself, and if not, why not.
 *
 * `requested` wins over `policy` when both hold: the caller asking to be
 * doubted is a statement about whether the *input* can be trusted, which is a
 * different and more serious thing than a run being large.
 *
 * `liveProducts` is the catalog before the run. Zero — a first import into an
 * empty catalog — scores no share at all rather than a full one: there is
 * nothing there to endanger, and the creates ceiling is what judges it.
 */
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
