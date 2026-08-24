import { Logger } from '@nestjs/common';
import { AddressComponents } from '@b2b-catalog-platform/shared';
import { HttpAddressSuggestions } from './http-address-suggestions';

/**
 * What a suggestion provider has to answer (ADR 0040). The interface is public,
 * and so is every adapter — what a deployment supplies is the sidecar behind
 * the `http` one, because no provider generalises across regions: the one with
 * the best data in one country is weak or absent in another, and they disagree
 * about the *shape* of an answer as much as its quality.
 *
 * Components, never one formatted line: the delivery-zone rule keys off the
 * postal code, and re-parsing a formatted line would throw away what the
 * provider already knew.
 */
export interface AddressSuggestionPort {
  /**
   * @param query what the customer has typed so far — already trimmed and
   *   length-bounded by the controller (NFR-SEC-08).
   * @param country ISO 3166-1 alpha-2 to bias the search, where the form knows
   *   one.
   * @param limit the most rows worth returning.
   */
  suggest(
    query: string,
    country: string | undefined,
    limit: number,
  ): Promise<AddressSuggestionResult[]>;
}

export interface AddressSuggestionResult {
  /** The provider's own one-line rendering — display only. */
  readonly label: string;
  readonly components: AddressComponents;
}

export const ADDRESS_SUGGESTION_PORT = 'ADDRESS_SUGGESTION_PORT';

/**
 * The default, and the whole of what the public repository ships: no provider.
 * The street field is then ordinary typed input, nothing about an order depends
 * on a suggestion having happened, and no personal data leaves the deployment.
 */
export class NoAddressSuggestions implements AddressSuggestionPort {
  async suggest(): Promise<AddressSuggestionResult[]> {
    return [];
  }
}

/**
 * Whether this deployment suggests addresses at all, decided by one thing: an
 * address to send the calls to (ADR 0040). There is no second switch in the
 * deployment config — nothing in the browser needs to know, and one knob cannot
 * contradict another.
 *
 * Which it chose is logged at boot. A misspelled variable name would otherwise
 * mean suggestions are quietly off, and a deployment that meant to configure a
 * provider would find that out from its customers.
 */
export function createAddressSuggestionPort(
  url: string | undefined,
): AddressSuggestionPort {
  const logger = new Logger('AddressSuggestions');
  if (!url) {
    logger.log('disabled: no ADDRESS_SUGGESTION_URL, addresses are typed');
    return new NoAddressSuggestions();
  }
  logger.log(`enabled: suggestion sidecar at ${url}`);
  return new HttpAddressSuggestions(url);
}
