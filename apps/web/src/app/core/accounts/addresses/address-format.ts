import {
  Address,
  addressLines,
  streetLine,
} from '@b2b-catalog-platform/shared/core/accounts';

interface Country {
  readonly code: string;
  readonly label: string;
}

/** An address's heading in a list: its label, else its street. */
export function addressDisplayName(address: Address): string {
  return address.label ?? streetLine(address);
}

/** The lines under `addressDisplayName`, without the one it already says. */
export function addressDetailLines(
  address: Address,
  config: { readonly countries: readonly Country[] } | undefined,
): string[] {
  const street = streetLine(address);
  return addressLines(address, config).filter(
    (line) => address.label || line !== street,
  );
}
