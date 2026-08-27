import { Address } from '@b2b-catalog-platform/shared';

interface Country {
  readonly code: string;
  readonly label: string;
}

/**
 * The street as it is printed: the line the provider fills, and after it what
 * is inside the building — an office or apartment identifies an address as much
 * as its number does, and on a card they read as one thing.
 */
export function streetLine(address: Address): string {
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
  address: Address,
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

/**
 * What to call one address in a list — its label where the customer gave it
 * one, otherwise where it is. Two rows that render the same are two addresses
 * at the same place: labelling one of them is how to tell them apart, not a
 * rule the form enforces up front.
 */
export function addressDisplayName(address: Address): string {
  return address.label ?? streetLine(address);
}

/**
 * The lines under that heading: everything the heading did not already say.
 * Paired with `addressDisplayName` here rather than at the card, so the two
 * cannot drift into printing something twice or dropping it altogether.
 */
export function addressDetailLines(
  address: Address,
  config: { readonly countries: readonly Country[] } | undefined,
): string[] {
  const street = streetLine(address);
  return addressLines(address, config).filter((line) => {
    // Unlabelled, so the street *is* the heading.
    if (!address.label && line === street) return false;
    return true;
  });
}
