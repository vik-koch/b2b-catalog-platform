import { oc } from '@orpc/contract';
import { z } from 'zod';
import { commonAuthErrors } from './api-error';

/**
 * Customer tiers (FR-AUTH-05), admin side.
 *
 * The default list is deliberately absent here: it is
 * `products.defaultPriceMinor`, not a row, so it has no id and cannot be
 * created, renamed or deleted through this surface.
 */

/** Matches the `customer_tiers.key` varchar(64). */
export const TIER_KEY_MAX_LENGTH = 64;
/** Matches the `customer_tiers.label` varchar(255). */
export const TIER_LABEL_MAX_LENGTH = 255;

/**
 * The key a catalog sync file addresses a price list by (`price:<key>`
 * columns), so it has to survive a spreadsheet round-trip: lowercase, no
 * spaces, no quoting rules of its own. `default` is refused here as well as by
 * a check constraint — that key already names the base list.
 */
export const tierKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(TIER_KEY_MAX_LENGTH)
  .regex(
    /^[a-z0-9][a-z0-9-]*$/,
    'Use lowercase letters, digits and hyphens (e.g. "wholesale")',
  )
  .refine((k) => k !== 'default', '"default" names the base price list');

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
    id: z.string().uuid(),
    key: z.string(),
    label: z.string(),
    /** Customer accounts currently on this tier (staff are never counted). */
    userCount: z.number().int().nonnegative(),
    /** Products with a price override in this tier. */
    priceCount: z.number().int().nonnegative(),
    /**
     * Where this tier sits in staff screens — the tier list and the product
     * editor's price fields. **Presentation only.** Tiers do not rank: nothing
     * about a price depends on this number, and "the tier above" is not a
     * question the pricing model can answer.
     */
    sortOrder: z.number().int(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type CustomerTier = z.infer<typeof customerTierSchema>;

/** One tier's new place in the list. */
export const tierOrderEntrySchema = z
  .object({ id: z.string().uuid(), sortOrder: z.number().int() })
  .strict();

export const reorderTiersSchema = z
  .object({ order: z.array(tierOrderEntrySchema) })
  .strict();
export type ReorderTiersRequest = z.infer<typeof reorderTiersSchema>;

/**
 * Why a tier action was refused. `tier-has-*` are the delete guard, and the
 * list already knows both counts, so it says which of its own numbers is in the
 * way without the server phrasing it.
 */
export const TIER_ERROR_CODES = [
  'tier-not-found',
  'tier-key-taken',
  'tier-has-accounts',
  'tier-has-prices',
] as const;
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
           * Customer accounts on the base list — the one figure the synthetic
           * default entry cannot derive on the client, since "no tier" is a
           * null, not a row. A sibling field rather than a tier-shaped object
           * with a null id: the default list is a column, and nothing that
           * consumes a `CustomerTier` should have to handle an id-less one.
           */
          defaultUserCount: z.number().int().nonnegative(),
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
        params: z.object({ id: z.string().uuid() }),
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
    .output(z.object({ tiers: z.array(customerTierSchema) }).strict()),

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
    })
    .input(z.object({ params: z.object({ id: z.string().uuid() }) }))
    .output(z.object({ message: z.string() })),
};
