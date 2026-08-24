import { Address } from '@b2b-catalog-platform/shared';

interface Country {
  readonly code: string;
  readonly label: string;
}

/**
 * An address as it is written out, one line per line. Kept as an array rather
 * than one joined string so a card can render it as lines and a summary can
 * join it with commas, without either re-deciding the order.
 *
 * The order is the common European one — recipient, street, postcode and city,
 * region, country. A deployment shipping somewhere that writes them the other
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
    address.companyName,
    address.street,
    address.street2,
    [address.postalCode, address.city].filter(Boolean).join(' '),
    address.region,
    domestic ? null : (country?.label ?? address.country),
  ].filter((line): line is string => Boolean(line && line.trim()));
}

/**
 * What to call one address in a list — its label where the customer gave it
 * one, otherwise its own first line. A name is never asked for at checkout, so
 * there is always one to show, and two rows that render the same are two
 * addresses at the same place: labelling one of them is the way to tell them
 * apart, not a rule the form enforces up front.
 */
export function addressDisplayName(
  address: Address,
  config: { readonly countries: readonly Country[] } | undefined,
): string {
  return address.label ?? addressLines(address, config)[0] ?? '';
}
