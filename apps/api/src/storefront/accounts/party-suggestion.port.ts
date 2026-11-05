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
