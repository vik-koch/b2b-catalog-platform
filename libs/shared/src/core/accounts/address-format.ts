/**
 * How an address is written out. Shared rather than web-only: the API prints
 * the same address into an order's PDF (FR-ORD-05), and a document that wrote
 * it differently from the page it copies would be a second opinion about
 * where the goods are going.
 */

/**
 * The parts of an address that get written down. Spelled out rather than
 * imported from the contract so a screen that only formats an address does not
 * pull Zod along with it — and so an order's frozen snapshot, which has no id
 * and no label, is as much an address here as a saved one is.
 */
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

/**
 * The street as it is printed: the line the provider fills, and after it what
 * is inside the building — an office or apartment identifies an address as much
 * as its number does, and on a card they read as one thing.
 */
export function streetLine(address: WrittenAddress): string {
  return [address.street, address.street2].filter(Boolean).join(', ');
}

/**
 * An address as it is written out, one line per line. Kept as an array rather
 * than one joined string so a card can render it as lines and a summary can
 * join it with commas, without either re-deciding the order.
 *
 * The order is the common European one — street, postcode and city, region,
 * country. A deployment shipping somewhere that writes them the other
 * way round would order this from config; nothing here needs that yet.
 *
 * The country is left off where the deployment ships to one and the address is
 * in it: a domestic deployment printing its own country on every address says
 * nothing. An address in another country still names it — that is the case the
 * line exists for.
 */
export function addressLines(
  address: WrittenAddress,
  // The country list as the deployment config hands it over — deeply readonly
  // there, so the shape is spelled out rather than reusing `AddressConfig`.
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
