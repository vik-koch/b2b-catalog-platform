import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import { apiErrorSchema, commonAuthErrorSchema } from './api-error';

const c = initContract();

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
const tierErrorSchema = apiErrorSchema(TIER_ERROR_CODES);

export const tiersContract = c.router(
  {
    listTiers: {
      method: 'GET',
      path: '/admin/tiers',
      responses: {
        200: z
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
      },
      summary: 'List the additional customer tiers (admin)',
    },
    createTier: {
      method: 'POST',
      path: '/admin/tiers',
      body: tierInputSchema,
      responses: {
        201: customerTierSchema,
        // Key already taken.
        409: tierErrorSchema,
      },
      summary: 'Create a customer tier (admin)',
    },
    updateTier: {
      method: 'PUT',
      path: '/admin/tiers/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: tierInputSchema,
      responses: {
        200: customerTierSchema,
        404: tierErrorSchema,
        // Key already taken by another tier.
        409: tierErrorSchema,
      },
      summary: 'Rename a customer tier or change its sync key (admin)',
    },
    reorderTiers: {
      method: 'PATCH',
      path: '/admin/tiers/order',
      body: reorderTiersSchema,
      responses: {
        200: z.object({ tiers: z.array(customerTierSchema) }).strict(),
        404: tierErrorSchema,
      },
      summary: 'Set the display order of the tier list (admin)',
    },
    deleteTier: {
      method: 'DELETE',
      path: '/admin/tiers/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      body: z.void(),
      responses: {
        200: z.object({ message: z.string() }),
        404: tierErrorSchema,
        // Still referenced by accounts or product prices.
        409: tierErrorSchema,
      },
      summary: 'Delete an unreferenced customer tier (admin)',
    },
  },
  {
    commonResponses: { 401: commonAuthErrorSchema, 403: commonAuthErrorSchema },
  },
);
