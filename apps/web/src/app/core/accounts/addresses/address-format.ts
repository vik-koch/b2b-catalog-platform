import {
  Address,
  addressLines,
  streetLine,
} from '@b2b-catalog-platform/shared';

// The two rules an order's PDF prints by as well as the screens do, so a
// document and the page it copies cannot write one address two ways.
export { addressLines, streetLine };

interface Country {
  readonly code: string;
  readonly label: string;
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
