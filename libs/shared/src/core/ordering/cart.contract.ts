import * as z from 'zod';
import {
  availabilitySchema,
  catalogImageSchema,
  productImageSchema,
  productPackagingSchema,
  productUnitSchema,
  productVariantSchema,
  unitPricesSchema,
} from '../catalog/catalog.contract';
import { CART_NOTE_MAX, LINE_PIECES_MAX } from '../catalog/product-units';

/**
 * A line as the browser holds it. Always in pieces, whatever the unit says,
 * so nothing on the wire is fractional. One product is one line; the note
 * describes it rather than distinguishing it.
 */
export const cartLineSchema = z
  .object({
    slug: z.string().trim().min(1).max(255),
    unit: productUnitSchema,
    pieces: z.number().int().positive().max(LINE_PIECES_MAX),
    note: z.string().trim().min(1).max(CART_NOTE_MAX).nullable().optional(),
  })
  .strict();
export type CartLine = z.infer<typeof cartLineSchema>;

/**
 * What is wrong with a line. Advisories, never a refusal: a stale cart is a
 * state to show.
 *
 * - `unavailable` covers deleted, unpublished and never-existed alike, so the
 *   endpoint cannot enumerate the unpublished catalog.
 * - `quantity-corrected`: the returned `pieces` is not what was sent.
 * - `unit-unavailable`: the unit fell back to the piece; the pieces stand.
 * - `price-unavailable`: no exact price, so the total is null, never zero.
 * - `out-of-stock` (FR-STOCK-04): the line is fine, only the order is refused.
 *   "Few left" is not an issue: a manager reviews it.
 */
const CART_LINE_ISSUES = [
  'unavailable',
  'unit-unavailable',
  'quantity-corrected',
  'note-not-allowed',
  'price-unavailable',
  'out-of-stock',
] as const;
export type CartLineIssue = (typeof CART_LINE_ISSUES)[number];

/**
 * A priced line. `slug` echoes what was sent, so the browser can match the
 * answer to its line even where every other field is null.
 */
export const cartPreviewLineSchema = z
  .object({
    slug: z.string(),
    unit: productUnitSchema,
    pieces: z.number().int().positive(),
    note: z.string().nullable(),
    /** Null for an unavailable product. */
    name: z.string().nullable(),
    image: catalogImageSchema.nullable(),
    /** So the line's mark opens the variants without a second request
     * (FR-CAT-13). */
    variants: z.array(productVariantSchema),
    images: z.array(productImageSchema),
    packaging: productPackagingSchema.nullable(),
    prices: unitPricesSchema.nullable(),
    /** The card's badge (FR-STOCK-03), and the baseline FR-CART-10 compares. */
    availability: availabilitySchema,
    /**
     * Per box unit, never multiplied by `boxCount`: with them the browser adds
     * up the shipment between an edit and its answer (`shipmentEstimate`).
     */
    boxVolume: z.string().nullable(),
    boxWeight: z.string().nullable(),
    boxCount: z.number().int().positive().nullable(),
    /** False for a product that is gone, which is why a note already written
     * is reported dropped (FR-CART-08). */
    lineNoteEnabled: z.boolean(),
    /** Null falls back to the storefront text. */
    lineNotePrompt: z.string().nullable(),
    /** Null where the line cannot be priced exactly. */
    lineTotalMinor: z.number().int().nonnegative().nullable(),
    /** The product's rate or the default (NFR-LEGAL-11); null where no tax is
     * charged. */
    taxRate: z.number().nullable(),
    /** The card's sold-together marker (FR-SET-05). */
    pairedCount: z.number().int().nonnegative(),
    /** The card's set marker (FR-CAT-10). */
    parts: z.array(z.string()),
    /**
     * Pieces of cover missing (FR-SET-02/03), null where satisfied. Not an
     * `issue`: submission re-prices on any issue, and a pairing is advisory
     * unless the deployment enforces it.
     */
    pairingShortPieces: z.number().int().positive().nullable(),
    issues: z.array(z.enum(CART_LINE_ISSUES)),
  })
  .strict();
export type CartPreviewLine = z.infer<typeof cartPreviewLineSchema>;

/**
 * The shipment summary (FR-UNIT-11), labelled approximate: part boxes are
 * derived through the packaging ratios. A line with no box is counted in
 * `uncoveredLines` rather than left out in silence.
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
    /** The priceable lines' sum; `complete` is false where one had no price. */
    totalMinor: z.number().int().nonnegative(),
    complete: z.boolean(),
    shipment: shipmentSummarySchema,
  })
  .strict();
export type CartPreview = z.infer<typeof cartPreviewSchema>;
