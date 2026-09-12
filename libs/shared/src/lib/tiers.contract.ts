import { oc } from '@orpc/contract';
import * as z from 'zod';
import {
  TIER_ERROR_CODES,
  TIER_KEY_MAX_LENGTH,
  TIER_KEY_PATTERN,
  TIER_LABEL_MAX_LENGTH,
} from './tier-constants';
import { commonAuthErrors } from './api-error';

/**
 * Customer tiers (FR-AUTH-05), admin side.
 *
 * Every price list is here, the default one included — it is an ordinary row
 * carrying a badge. No key is reserved: which list guests are charged is the
 * badge's answer, not a name's.
 */

/**
 * The key a catalog sync file addresses a price list by (`price:<key>`
 * columns), so it has to survive a spreadsheet round-trip: one word, any
 * script, no spaces and no quoting rules of its own.
 *
 * Normalized to NFC before anything compares it: two encodings of the same
 * accented or composed letter look identical in a spreadsheet and would
 * otherwise address two different lists.
 */
export const tierKeySchema = z
  .string()
  .trim()
  .transform((k) => k.normalize('NFC'))
  .pipe(
    z
      .string()
      .min(1)
      .max(TIER_KEY_MAX_LENGTH)
      .regex(
        TIER_KEY_PATTERN,
        'Use letters, digits, hyphens and underscores, in one word (e.g. "wholesale")',
      ),
  );

export const tierInputSchema = z
  .object({
    key: tierKeySchema,
    label: z.string().trim().min(1).max(TIER_LABEL_MAX_LENGTH),
  })
  .strict();
export type TierInput = z.infer<typeof tierInputSchema>;

/**
 * A tier as staff see it. The two counts are what makes the delete guard
 * explainable *before* the admin presses delete: the foreign keys restrict, so
 * a tier holding either is undeletable until those references are resolved.
 */
export const customerTierSchema = z
  .object({
    id: z.uuid(),
    key: z.string(),
    label: z.string(),
    /** Customer accounts currently on this tier (staff are never counted). */
    userCount: z.number().int().nonnegative(),
    /** Products this tier prices itself. */
    priceCount: z.number().int().nonnegative(),
    /**
     * The list guests, staff and untiered customers are charged, and the one a
     * product must be priced in to be published. Exactly one tier carries it.
     */
    isDefault: z.boolean(),
    /**
     * How many products on the storefront this tier does not price — what
     * badging it would take off the storefront. Zero on the tier that already
     * carries the badge, which has nothing to move to.
     */
    wouldUnpublish: z.number().int().nonnegative(),
    /**
     * Where this tier sits in staff screens — the tier list and the product
     * editor's price fields. **Presentation only.** Tiers do not rank: nothing
     * about a price depends on this number, and "the tier above" is not a
     * question the pricing model can answer.
     */
    sortOrder: z.number().int(),
    updatedAt: z.iso.datetime(),
  })
  .strict();
export type CustomerTier = z.infer<typeof customerTierSchema>;

/** One tier's new place in the list. */
export const tierOrderEntrySchema = z
  .object({ id: z.uuid(), sortOrder: z.number().int() })
  .strict();

export const reorderTiersSchema = z
  .object({ order: z.array(tierOrderEntrySchema) })
  .strict();
export type ReorderTiersRequest = z.infer<typeof reorderTiersSchema>;

export type TierErrorCode = (typeof TIER_ERROR_CODES)[number];

/**
 * Each code carries its own status here, where the ts-rest shape only paired
 * them by convention: a status listed one schema of four possible codes, and
 * nothing stopped the server answering 409 with `tier-not-found`.
 */
const tierErrors = {
  'tier-not-found': { status: 404 },
  'tier-key-taken': { status: 409 },
  'tier-has-accounts': { status: 409 },
  'tier-has-prices': { status: 409 },
  'tier-is-default': { status: 409 },
} as const;

/** Every route here is admin-only, so they all carry the two auth refusals. */
const admin = oc.errors(commonAuthErrors);

export const tiersContract = {
  listTiers: admin
    .route({
      method: 'GET',
      path: '/admin/tiers',
      summary: 'List the additional customer tiers (admin)',
    })
    .output(
      z
        .object({
          tiers: z.array(customerTierSchema),
          /**
           * Live products in the catalog. A sibling rather than a per-tier
           * figure because it is one number about the catalog, and it is what
           * turns each tier's `priceCount` into the gap behind it: "wholesale
           * prices 98 of 100" is the question a tier review ends on.
           */
          productCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),

  createTier: admin
    .route({
      method: 'POST',
      path: '/admin/tiers',
      successStatus: 201,
      inputStructure: 'detailed',
      summary: 'Create a customer tier (admin)',
    })
    .errors({ 'tier-key-taken': tierErrors['tier-key-taken'] })
    .input(z.object({ body: tierInputSchema }))
    .output(customerTierSchema),

  updateTier: admin
    .route({
      method: 'PUT',
      path: '/admin/tiers/{id}',
      inputStructure: 'detailed',
      summary: 'Rename a customer tier or change its sync key (admin)',
    })
    .errors({
      'tier-not-found': tierErrors['tier-not-found'],
      'tier-key-taken': tierErrors['tier-key-taken'],
    })
    .input(
      z.object({
        params: z.object({ id: z.uuid() }),
        body: tierInputSchema,
      }),
    )
    .output(customerTierSchema),

  reorderTiers: admin
    .route({
      method: 'PATCH',
      // No clash with `/admin/tiers/{id}`: nothing else answers PATCH here.
      path: '/admin/tiers/order',
      inputStructure: 'detailed',
      summary: 'Set the display order of the tier list (admin)',
    })
    .errors({ 'tier-not-found': tierErrors['tier-not-found'] })
    .input(z.object({ body: reorderTiersSchema }))
    .output(
      z
        .object({
          tiers: z.array(customerTierSchema),
          /**
           * Live products in the catalog. A sibling rather than a per-tier
           * figure because it is one number about the catalog, and it is what
           * turns each tier's `priceCount` into the gap behind it: "wholesale
           * prices 98 of 100" is the question a tier review ends on.
           */
          productCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),

  setDefaultTier: admin
    .route({
      method: 'PUT',
      path: '/admin/tiers/{id}/default',
      inputStructure: 'detailed',
      summary: 'Move the default badge to this price list (admin)',
    })
    .errors({ 'tier-not-found': tierErrors['tier-not-found'] })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(
      z
        .object({
          tiers: z.array(customerTierSchema),
          /** Live products in the catalog, as the list route reports it — the
           * move is answered with the whole list, so the screen can take it
           * without asking again. */
          productCount: z.number().int().nonnegative(),
          /** Products this move took off the storefront, because the newly
           * badged list does not price them. Reported rather than refused: the
           * screen says the figure before the move, and an admin who accepts
           * it is owed the confirmation that it happened. */
          unpublished: z.number().int().nonnegative(),
        })
        .strict(),
    ),

  deleteTier: admin
    .route({
      method: 'DELETE',
      path: '/admin/tiers/{id}',
      inputStructure: 'detailed',
      summary: 'Delete an unreferenced customer tier (admin)',
    })
    .errors({
      'tier-not-found': tierErrors['tier-not-found'],
      // Still referenced by accounts or product prices.
      'tier-has-accounts': tierErrors['tier-has-accounts'],
      'tier-has-prices': tierErrors['tier-has-prices'],
      'tier-is-default': tierErrors['tier-is-default'],
    })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),
};
