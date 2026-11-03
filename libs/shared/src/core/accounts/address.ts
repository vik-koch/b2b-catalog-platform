/**
 * Addresses: the field bounds, what a lookup may ask for, and how one is
 * written out, which the API's order PDF shares with the page. Plain data with
 * no imports, so the address form does not pull Zod along with one limit.
 */

/** An optional short name for the row, to tell two addresses apart. */
export const ADDRESS_LABEL_MAX_LENGTH = 100;

/** Matches the varchar the columns carry; a bound, not an editorial rule. */
export const ADDRESS_LINE_MAX_LENGTH = 255;

export const ADDRESS_POSTAL_CODE_MAX_LENGTH = 32;

/** The suggestion endpoint is metered (NFR-SEC-08), so the query is bounded
 * at both ends: a too-short one is a paid call that matches nothing useful. */
export const ADDRESS_QUERY_MIN_LENGTH = 3;

export const ADDRESS_QUERY_MAX_LENGTH = 120;

export const ADDRESS_SUGGESTION_LIMIT = 8;

/** The parts of an address that get written down, spelled out so an order's
 * snapshot (no id, no label) is as much an address as a saved one. */
export interface WrittenAddress {
  readonly street: string;
  readonly street2: string | null;
  readonly postalCode: string;
  readonly city: string;
  readonly region: string | null;
  readonly country: string;
}

interface Country {
  readonly code: string;
  readonly label: string;
}

/** The street as printed, followed by what is inside the building: on a card
 * they read as one thing. */
export function streetLine(address: WrittenAddress): string {
  return [address.street, address.street2].filter(Boolean).join(', ');
}

/**
 * An address one line per line, in the common European order, so a card and a
 * summary agree on it. The country is left off where the deployment ships to
 * that one country alone.
 */
export function addressLines(
  address: WrittenAddress,
  // Spelled out rather than `AddressConfig`, which the config hands over deeply
  // readonly.
  config: { readonly countries: readonly Country[] } | undefined,
): string[] {
  const countries = config?.countries ?? [];
  const country = countries.find((entry) => entry.code === address.country);
  const domestic =
    countries.length === 1 && countries[0].code === address.country;
  return [
    streetLine(address),
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.region,
    domestic ? null : (country?.label ?? address.country),
  ].filter((line): line is string => Boolean(line && line.trim()));
}
