import * as z from 'zod';
import { normalizePostalCode } from './postal-code';

/**
 * The deployment-owned half of checkout: how an order is referenced, and which
 * delivery zone a postal code falls into. Shared because the API decides both —
 * a zone the browser resolved and the server did not re-derive would be a
 * threshold the customer could choose for themselves.
 */

const postalCodeConfigSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .transform(normalizePostalCode);

/**
 * How a zone is matched. Prefixes cover formats that are not numeric at all;
 * a range covers a contiguous block, and only between codes of the same length
 * — a range from `1000` to `99999` compares strings of different widths and
 * would silently include or exclude by digit count. `all` is the catch-all.
 *
 * A zone matches on the postal code, and on nothing else: city text is
 * misspellable and a near-miss would quote the wrong threshold silently.
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
    /** Matches anything the zones above did not. Only the last zone may. */
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

/**
 * A delivery zone (FR-CART-07): a named area, and what an order must reach for
 * delivery inside it to be free.
 *
 * Advisory throughout — the threshold is quoted, never enforced, and no zone
 * prices a delivery. A manager does that, which is why there is no per-zone
 * price here to keep in step with one.
 */
export const deliveryZoneSchema = z
  .object({
    /** Snapshotted onto the order, so it outlives a renamed title. */
    key: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1),
    description: z.string().trim().min(1).optional(),
    /** Integer minor units, like every other price. Absent means no free
     * delivery in this zone — not a threshold of zero. */
    freeFromMinor: z.number().int().nonnegative().optional(),
    /**
     * Whether the deployment delivers here at all. Absent means it does; a
     * zone that sets it false is an area the shop does not drive to, named so
     * the checkout can say so while the address is being typed rather than
     * after the order is placed.
     *
     * Still advisory, like every other thing a zone says: the order goes
     * through and a manager answers it. What the customer is told is that they
     * will be asked for another address, which is a cheaper conversation
     * before the order than after it.
     */
    delivers: z.boolean().optional(),
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

/**
 * The zones, in the order they are tried: **first match wins**, so the narrow
 * ones lead and a catch-all closes the list.
 */
export const deliveryConfigSchema = z
  .object({
    zones: z.array(deliveryZoneSchema).superRefine((zones, ctx) => {
      const seen = new Set<string>();
      zones.forEach((zone, index) => {
        if (seen.has(zone.key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, 'key'],
            message: `zone ${zone.key} is listed twice`,
          });
        }
        seen.add(zone.key);
        // A catch-all anywhere but last makes every zone after it dead.
        if (zone.match.all === true && index !== zones.length - 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
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
 * How an order is referenced: `{prefix}-YYMMDD-NNNN`. The suffix is random
 * rather than a counter, so the reference does not publish how many orders the
 * shop takes in a day, and the date is read in the deployment's own timezone —
 * a customer quoting yesterday's number should not be told it is tomorrow's.
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
    /**
     * An IANA zone name, e.g. `Europe/Berlin`. Checked by building a formatter
     * with it, which is the only way to know the platform accepts one: an
     * unknown zone throws where it is *used*, and the only use is on the way to
     * a reference — so a typo left to runtime is a shop that boots cleanly and
     * refuses every order.
     */
    timezone: z
      .string()
      .trim()
      .min(1)
      .refine(isKnownTimezone, 'not a time zone this platform knows'),
  })
  .strict();
export type OrderReferenceConfig = z.infer<typeof orderReferenceConfigSchema>;
