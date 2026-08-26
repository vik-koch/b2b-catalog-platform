import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  catalogImageSchema,
  productPackagingSchema,
  unitPricesSchema,
} from './catalog.contract';
import { PRODUCT_UNITS } from './product-units';

const c = initContract();

/**
 * Pricing a cart (FR-CART-01/02). The cart itself lives in the browser — there
 * is no cart table — so this endpoint takes the whole cart on every call and
 * answers with what it costs *now*.
 *
 * It answers **200 with per-line advisories**, never a refusal: a cart that has
 * gone stale while it sat is a normal state to be shown, not a request to
 * reject. Submission is the opposite (see `ordersContract`), and neither ever
 * mutates the browser's cart — a dead line is flagged, and removing it is the
 * customer's action.
 */

/** One note describes a whole line ("100 in colour A, 100 in colour B"), so it
 * has room to. */
export const CART_NOTE_MAX = 500;
/**
 * How many distinct lines may be priced in one call. A bound, not a business
 * rule: this is an unauthenticated N-product lookup, and a hand-written body
 * must not be able to ask for ten thousand.
 */
export const CART_LINES_MAX = 100;

/** The unit a line is bought in — never normalized between units: four packs
 * stay four packs even where a box holds exactly four. */
export const productUnitSchema = z.enum(PRODUCT_UNITS);

/**
 * A line as the browser holds it: what, in which unit, how many, and the note
 * where the product allows one. A product in a given unit is exactly one line,
 * so `slug` + `unit` is the identity — the note describes the line rather than
 * distinguishing it.
 */
export const cartLineSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    unit: productUnitSchema,
    quantity: z.number().int().positive().max(1_000_000),
    note: z.string().trim().min(1).max(CART_NOTE_MAX).nullable().optional(),
  })
  .strict();
export type CartLine = z.infer<typeof cartLineSchema>;

export const cartRequestSchema = z
  .object({ lines: z.array(cartLineSchema).max(CART_LINES_MAX) })
  .strict();
export type CartRequest = z.infer<typeof cartRequestSchema>;

/**
 * What is wrong with a line, if anything.
 *
 * `unavailable` is one code for soft-deleted, unpublished **and** never-existed
 * alike: distinguishing them would make the endpoint an oracle that enumerates
 * the unpublished catalog by difference.
 *
 * `quantity-corrected` says the returned `quantity` is not the one that was
 * sent — the line carries the corrected figure, so there is nothing to read out
 * of the code itself. `price-unavailable` means the line cannot be priced
 * exactly (a repackaged product whose stored basis no longer divides the
 * quantity); its total is null and must never be shown as a zero.
 */
export const CART_LINE_ISSUES = [
  'unavailable',
  'unit-unavailable',
  'quantity-corrected',
  'note-not-allowed',
  'price-unavailable',
] as const;
export type CartLineIssue = (typeof CART_LINE_ISSUES)[number];

/**
 * A priced line. `slug` and `unit` echo what was sent, so the browser can match
 * the answer back onto its own cart even where the product is gone and every
 * other field is null.
 */
export const cartPreviewLineSchema = z
  .object({
    slug: z.string(),
    unit: productUnitSchema,
    /** Corrected where `quantity-corrected` is among the issues. */
    quantity: z.number().int().positive(),
    note: z.string().nullable(),
    /** Null for an unavailable product — there is nothing to name it with
     * beyond the slug, which the browser already has. */
    name: z.string().nullable(),
    image: catalogImageSchema.nullable(),
    packaging: productPackagingSchema.nullable(),
    prices: unitPricesSchema.nullable(),
    /**
     * What one box unit weighs and takes up, and how many cartons it ships as
     * — null where the product states none, and null throughout for a product
     * that is gone.
     *
     * Sent for the same reason the prices are: with them the browser can add
     * the estimate up itself between an edit and the answer to it, so the
     * consignment moves with the stepper instead of a beat behind it. The
     * figures are per box unit, never multiplied by `boxCount`
     * (`shipmentEstimate` owns that arithmetic).
     */
    boxVolume: z.string().nullable(),
    boxWeight: z.string().nullable(),
    boxCount: z.number().int().positive().nullable(),
    /** Exact, or null where the line cannot be priced. */
    lineTotalMinor: z.number().int().nonnegative().nullable(),
    issues: z.array(z.enum(CART_LINE_ISSUES)),
  })
  .strict();
export type CartPreviewLine = z.infer<typeof cartPreviewLineSchema>;

/**
 * The shipment summary (FR-UNIT-11), added up across the lines and labelled
 * approximate: piece and pack lines are derived from the box figures through
 * the packaging ratios, and a manager confirms the real consignment.
 * `uncoveredLines` is how many lines have no box to derive from — a summary
 * covering half the cart says so rather than omitting the rest in silence.
 */
export const shipmentSummarySchema = z
  .object({
    cartons: z.number().int().nonnegative(),
    volume: z.string().nullable(),
    weight: z.string().nullable(),
    coveredLines: z.number().int().nonnegative(),
    uncoveredLines: z.number().int().nonnegative(),
    approximate: z.boolean(),
  })
  .strict();
export type ShipmentSummary = z.infer<typeof shipmentSummarySchema>;

export const cartPreviewSchema = z
  .object({
    lines: z.array(cartPreviewLineSchema),
    /** The sum of the priceable lines. `complete` is false where a line had no
     * price, so a partial total is never read as the whole cart's. */
    totalMinor: z.number().int().nonnegative(),
    complete: z.boolean(),
    shipment: shipmentSummarySchema,
  })
  .strict();
export type CartPreview = z.infer<typeof cartPreviewSchema>;

export const cartContract = c.router({
  previewCart: {
    method: 'POST',
    path: '/cart/preview',
    body: cartRequestSchema,
    responses: { 200: cartPreviewSchema },
    summary: 'Price a cart as it stands, with per-line advisories',
  },
});
