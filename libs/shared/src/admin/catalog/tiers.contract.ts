import { oc } from '@orpc/contract';
import * as z from 'zod';
import { TIER_KEY_MAX_LENGTH } from '../../core/catalog/tiers';
import {
  type TierErrorCode,
  TIER_KEY_PATTERN,
  TIER_LABEL_MAX_LENGTH,
} from './tiers';
import { commonAuthErrors } from '../../lib/core/api-error';

/**
 * The key a sync file addresses a price list by (see `TIER_KEY_PATTERN`).
 * Normalized to NFC first: two encodings of one accented letter look the same
 * in a spreadsheet and would address two lists.
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
 * A customer tier as staff see it (FR-AUTH-05). The default price list is one
 * of these, an ordinary row carrying the badge, so no key is reserved. The
 * counts explain the delete guard before delete is pressed.
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
    /** Live products this tier does not price: what badging it would take
     * off the storefront. Zero on the badged tier. */
    wouldUnpublish: z.number().int().nonnegative(),
    /** Its place in staff screens. Presentation only: tiers do not rank. */
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

/** The tier list, as every route that changes it answers. */
const tierListSchema = z
  .object({
    tiers: z.array(customerTierSchema),
    /** Live products in the catalog: what turns each `priceCount` into the
     * gap behind it, "wholesale prices 98 of 100". */
    productCount: z.number().int().nonnegative(),
  })
  .strict();

const tierErrors = {
  'tier-not-found': { status: 404 },
  'tier-key-taken': { status: 409 },
  'tier-has-accounts': { status: 409 },
  'tier-has-prices': { status: 409 },
  'tier-is-default': { status: 409 },
} as const satisfies Record<TierErrorCode, { status: number }>;

/** Every route here is admin-only. */
const admin = oc.errors(commonAuthErrors);

export const tiersContract = {
  listTiers: admin
    .route({
      method: 'GET',
      path: '/admin/tiers',
      summary: 'List the customer tiers (admin)',
    })
    .output(tierListSchema),

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
      // No clash with `{id}`: nothing else answers PATCH here.
      path: '/admin/tiers/order',
      inputStructure: 'detailed',
      summary: 'Set the display order of the tier list (admin)',
    })
    .errors({ 'tier-not-found': tierErrors['tier-not-found'] })
    .input(z.object({ body: reorderTiersSchema }))
    .output(tierListSchema),

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
      tierListSchema
        .extend({
          /** Products the move took off the storefront, unpriced in the newly
           * badged list. Reported, not refused: the screen warned first. */
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
      'tier-has-accounts': tierErrors['tier-has-accounts'],
      'tier-has-prices': tierErrors['tier-has-prices'],
      'tier-is-default': tierErrors['tier-is-default'],
    })
    .input(z.object({ params: z.object({ id: z.uuid() }) }))
    .output(z.object({ message: z.string() })),
};
