import { normalizePostalCode } from './postal-code';

/**
 * Which delivery zone an address falls into. Import-free but for the postal
 * code helpers, so the storefront's zone hint does not pull the order schemas
 * — and Zod — into the first load (see `auth-constants.ts` for why).
 *
 * The API re-derives the zone when the order is placed: one the browser
 * resolved and the server did not re-check would be a threshold the customer
 * could choose for themselves.
 */

/** As much of an address as choosing a zone reads. */
export interface DeliveryZoneQuery {
  readonly postalCode: string;
}

/**
 * How a zone is matched. Prefixes cover formats that are not numeric at all;
 * a range covers a contiguous block, and only between codes of the same length
 * — a range from `1000` to `99999` compares strings of different widths and
 * would silently include or exclude by digit count. `all` is the catch-all.
 */
export interface ZoneMatcher {
  readonly match: {
    readonly postalPrefixes?: readonly string[];
    readonly postalRanges?: readonly {
      readonly from: string;
      readonly to: string;
    }[];
    readonly all?: true;
  };
}

/**
 * The first zone the address falls into, or null where none does — which is a
 * normal answer: a deployment need not describe every address it ships to.
 *
 * Generic in the zone, so a caller gets its own row back with whatever else it
 * carries — the key and the threshold an order snapshots.
 */
export function resolveDeliveryZone<T extends ZoneMatcher>(
  zones: readonly T[],
  address: DeliveryZoneQuery,
): T | null {
  const code = normalizePostalCode(address.postalCode.trim());

  for (const zone of zones) {
    const { match } = zone;
    if (match.all === true) return zone;
    if (match.postalPrefixes?.some((prefix) => code.startsWith(prefix))) {
      return zone;
    }
    if (
      match.postalRanges?.some(
        (range) =>
          code.length === range.from.length &&
          code >= range.from &&
          code <= range.to,
      )
    ) {
      return zone;
    }
  }
  return null;
}
