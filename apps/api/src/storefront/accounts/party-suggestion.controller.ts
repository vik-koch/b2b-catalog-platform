import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { SidecarSuggestionThrottle } from '../../platform/throttling/throttle-presets';
import {
  PARTY_SUGGESTION_PORT,
  PartySuggestionPort,
} from './party-suggestion.port';
import {
  PARTY_QUERY_MIN_LENGTH,
  PARTY_SUGGESTION_LIMIT,
  partySuggestionContract,
} from '@b2b-catalog-platform/shared/core/accounts';

/**
 * Company suggestions (FR-AUTH-09, NFR-SEC-08). Open, since registration uses
 * them, and throttled hard: each call may cost money. A short query never
 * reaches the provider.
 */
@Controller()
export class PartySuggestionController {
  constructor(
    @Inject(PARTY_SUGGESTION_PORT)
    private readonly parties: PartySuggestionPort,
  ) {}

  @SidecarSuggestionThrottle()
  @Implement(partySuggestionContract.suggestParties)
  suggestParties() {
    return implement(partySuggestionContract.suggestParties).handler(
      async ({ input: { query } }) => {
        const q = query.q.trim();
        if (q.length < PARTY_QUERY_MIN_LENGTH) return { items: [] };

        const items = await this.parties.suggest(q, PARTY_SUGGESTION_LIMIT);
        // The cap is the API's promise, not the provider's.
        return { items: items.slice(0, PARTY_SUGGESTION_LIMIT) };
      },
    );
  }
}
