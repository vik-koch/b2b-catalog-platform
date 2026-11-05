import { Logger } from '@nestjs/common';
import { HttpPartySuggestions } from './http-party-suggestions';
import { PartySuggestion } from '@b2b-catalog-platform/shared/core/accounts';

/**
 * What a company provider answers, apart from addresses: a
 * provider may serve one and not the other. A suggestion fills a form;
 * nothing may require that one was picked.
 */
export interface PartySuggestionPort {
  /** `query` is a name or a registration number, trimmed and bounded. */
  suggest(query: string, limit: number): Promise<PartySuggestion[]>;
}

export const PARTY_SUGGESTION_PORT = 'PARTY_SUGGESTION_PORT';

/** No provider: companies are typed, and nothing leaves the deployment. */
export class NoPartySuggestions implements PartySuggestionPort {
  async suggest(): Promise<PartySuggestion[]> {
    return [];
  }
}

/** The same sidecar URL as addresses, logged at boot for the same reason. */
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
