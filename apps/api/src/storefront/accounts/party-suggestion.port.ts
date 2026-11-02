import { Logger } from '@nestjs/common';
import { PartySuggestion } from '@b2b-catalog-platform/shared';
import { HttpPartySuggestions } from './http-party-suggestions';

/**
 * What a company-suggestion provider has to answer (ADR 0041). Its own port
 * beside `AddressSuggestionPort` rather than a widening of it: a company and an
 * address are different subjects with different answers, and a provider may
 * serve one and not the other.
 *
 * What comes back **fills** a form and never decides it — nothing downstream
 * may require that a suggestion was picked.
 */
export interface PartySuggestionPort {
  /**
   * @param query a name or a registration number, as typed — already trimmed
   *   and length-bounded by the controller (NFR-SEC-08).
   * @param limit the most rows worth returning.
   */
  suggest(query: string, limit: number): Promise<PartySuggestion[]>;
}

export const PARTY_SUGGESTION_PORT = 'PARTY_SUGGESTION_PORT';

/**
 * The default, and the whole of what the public repository ships: no provider.
 * Both company fields are then ordinary typed input, and no personal data
 * leaves the deployment.
 */
export class NoPartySuggestions implements PartySuggestionPort {
  async suggest(): Promise<PartySuggestion[]> {
    return [];
  }
}

/**
 * Whether this deployment suggests companies at all, decided by the one thing
 * that decides it for addresses too: an address to send the calls to. One
 * sidecar, one variable, two subjects (ADR 0041).
 *
 * Which it chose is logged at boot, for the same reason as its twin: a
 * misspelled variable name would otherwise mean suggestions are quietly off.
 */
export function createPartySuggestionPort(
  url: string | undefined,
): PartySuggestionPort {
  const logger = new Logger('CompanySuggestions');
  if (!url) {
    logger.log('disabled: no SUGGESTION_SIDECAR_URL, companies are typed');
    return new NoPartySuggestions();
  }
  logger.log(`enabled: suggestion sidecar at ${url}`);
  return new HttpPartySuggestions(url);
}
