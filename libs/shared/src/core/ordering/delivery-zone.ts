import { normalizePostalCode } from '../accounts/postal-code';

/**
 * Which delivery zone an address falls into, without Zod, for the checkout's
 * hint. The API re-derives it on submission: a zone the browser chose would be
 * a threshold the customer chose.
 */

/** As much of an address as choosing a zone reads. */
export interface DeliveryZoneQuery {
  readonly postalCode: string;
}

/** A range compares codes of its own length only: strings of different
 * widths would include or exclude by digit count. */
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

/** The first matching zone, or null: a deployment need not describe every
 * address it ships to. */
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
