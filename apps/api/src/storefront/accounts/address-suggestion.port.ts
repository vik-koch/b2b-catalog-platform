import { AddressComponents } from '@b2b-catalog-platform/shared/core/accounts';

/**
 * What an address provider answers. A deployment supplies the
 * sidecar behind the `http` adapter, since no provider serves every region.
 * Components, never one line: the delivery zone keys off the postal code.
 */
export interface AddressSuggestionPort {
  /** `query` arrives trimmed and bounded; `country` (ISO alpha-2) biases the
   * search where the form knows one. */
  suggest(
    query: string,
    country: string | undefined,
    limit: number,
  ): Promise<AddressSuggestionResult[]>;
}

export interface AddressSuggestionResult {
  /** Display only. */
  readonly label: string;
  readonly components: AddressComponents;
}

export const ADDRESS_SUGGESTION_PORT = 'ADDRESS_SUGGESTION_PORT';

/** No provider: addresses are typed, and nothing leaves the deployment. */
export class NoAddressSuggestions implements AddressSuggestionPort {
  async suggest(): Promise<AddressSuggestionResult[]> {
    return [];
  }
}
