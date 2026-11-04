import * as z from 'zod';
import { normalizePostalCode } from '../accounts/postal-code';

const postalCodeConfigSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform(normalizePostalCode);

/**
 * On the postal code only: a misspelt city would quote the wrong threshold
 * silently. Prefixes cover formats that are not numeric; a range compares
 * strings, so its ends must be the same length.
 */
const zoneMatchSchema = z
  .object({
    postalPrefixes: z.array(postalCodeConfigSchema).optional(),
    postalRanges: z
      .array(
        z
          .object({ from: postalCodeConfigSchema, to: postalCodeConfigSchema })
          .strict()
          .refine((range) => range.from.length === range.to.length, {
            message: 'a postal range compares codes of the same length',
          })
          .refine((range) => range.from <= range.to, {
            message: 'a postal range runs from the lower code to the higher',
          }),
      )
      .optional(),
    /** Only the last zone may. */
    all: z.literal(true).optional(),
  })
  .strict()
  .refine(
    (match) =>
      match.all === true ||
      Boolean(match.postalPrefixes?.length) ||
      Boolean(match.postalRanges?.length),
    { message: 'a zone matches on something' },
  );

/** A delivery zone (FR-CART-07), and what an order must reach for free
 * delivery in it. */
export const deliveryZoneSchema = z
  .object({
    /** Snapshotted onto the order, so it outlives a renamed title. */
    key: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    /** Absent: no free delivery here, not a threshold of zero. */
    freeFromMinor: z.number().int().nonnegative().optional(),
    /** False: an area the shop does not drive to, named so checkout says so
     * while the address is typed. The order still goes through. */
    delivers: z.boolean().optional(),
    /** Presentation only: neighbouring zones of one level share a row on
     * the conditions page. Matching ignores it. */
    level: z.number().int().nonnegative().optional(),
    match: zoneMatchSchema,
  })
  .strict()
  .refine(
    (zone) => zone.delivers !== false || zone.freeFromMinor === undefined,
    {
      message:
        'a zone that is not delivered to quotes no free-delivery minimum',
      path: ['freeFromMinor'],
    },
  );
export type DeliveryZone = z.infer<typeof deliveryZoneSchema>;

/** First match wins, so the narrow zones lead and a catch-all closes. */
export const deliveryConfigSchema = z
  .object({
    zones: z.array(deliveryZoneSchema).superRefine((zones, ctx) => {
      const seen = new Set<string>();
      zones.forEach((zone, index) => {
        if (seen.has(zone.key)) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'key'],
            message: `zone ${zone.key} is listed twice`,
          });
        }
        seen.add(zone.key);
        // A catch-all anywhere but last makes every zone after it dead.
        if (zone.match.all === true && index !== zones.length - 1) {
          ctx.addIssue({
            code: 'custom',
            path: [index, 'match', 'all'],
            message: 'the catch-all zone must be the last one',
          });
        }
      });
    }),
  })
  .strict();
export type DeliveryConfig = z.infer<typeof deliveryConfigSchema>;

function isKnownTimezone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * `{prefix}-YYMMDD-NNNN`: a random suffix, so a reference does not publish how
 * many orders a day the shop takes, and the date in the shop's time zone.
 */
export const orderReferenceConfigSchema = z
  .object({
    prefix: z
      .string()
      .trim()
      .min(1)
      .max(8)
      .regex(
        /^[\p{Lu}\p{N}]+$/u,
        'an order prefix is upper-case letters or digits, in any script',
      ),
    /** Checked at boot: an unknown zone throws only when a reference is
     * made, so a typo would boot cleanly and refuse every order. */
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine(isKnownTimezone, 'not a time zone this platform knows'),
  })
  .strict();
export type OrderReferenceConfig = z.infer<typeof orderReferenceConfigSchema>;

/** Where an order may be collected (FR-CART-07), apart from the offices: neither
 * is a subset of the other. An order snapshots key, name and address. */
const pickupLocationSchema = z
  .object({
    key: z.string().min(1).max(64),
    name: z.string(),
    /** Required: an order that cannot say where it is collected is stuck. */
    address: z.string().min(1),
    /** Opening hours, which gate: what the address does not say. */
    description: z.string().optional(),
    /** A link, not an embed: looked up in passing. */
    mapUrl: z.string().optional(),
  })
  .strict();

const pickupConfigSchema = z
  .object({
    locations: z
      .array(pickupLocationSchema)
      .min(1)
      .superRefine((locations, ctx) => {
        const seen = new Set<string>();
        locations.forEach((location, index) => {
          if (seen.has(location.key)) {
            // An order would snapshot whichever came first.
            ctx.addIssue({
              code: 'custom',
              path: [index, 'key'],
              message: `pickup location ${location.key} is listed twice`,
            });
          }
          seen.add(location.key);
        });
      }),
  })
  .strict();

/** Ordering's keys of `deployment.json`. */
export const orderingConfigShape = {
  /** Off: an order is invoiced to its delivery address, or none for a
   * pickup, so checkout asks for no invoice address at all. */
  billingAddressEnabled: z.boolean(),
  /** Absent, not empty, where the shop offers no pickup. */
  pickup: pickupConfigSchema.optional(),
  /** Quoted, never enforced, and no zone prices a delivery: a manager does. */
  delivery: deliveryConfigSchema.optional(),
  orderReference: orderReferenceConfigSchema.optional(),
};
