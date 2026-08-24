import { Controller, Inject } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import {
  PARTY_QUERY_MIN_LENGTH,
  PARTY_SUGGESTION_LIMIT,
  partySuggestionContract,
} from '@b2b-catalog-platform/shared';
import { SidecarSuggestionThrottle } from '../throttling/throttle-presets';
import {
  PARTY_SUGGESTION_PORT,
  PartySuggestionPort,
} from './party-suggestion.port';

/**
 * The company-suggestion proxy (FR-AUTH-09, NFR-SEC-08). Unauthenticated,
 * because the form that uses it is the registration form — the one place where
 * nobody has an account yet — and throttled like its address twin, because
 * every call here may cost the deployment money at a third party.
 *
 * A query shorter than the minimum answers empty rather than reaching the
 * provider: two letters match half a register and would be a paid call for
 * nothing.
 */
@Controller()
export class PartySuggestionController {
  constructor(
    @Inject(PARTY_SUGGESTION_PORT)
    private readonly parties: PartySuggestionPort,
  ) {}

  @SidecarSuggestionThrottle()
  @TsRestHandler(partySuggestionContract.suggestParties, {
    validateResponses: true,
  })
  suggestParties() {
    return tsRestHandler(
      partySuggestionContract.suggestParties,
      async ({ query }) => {
        const q = query.q.trim();
        if (q.length < PARTY_QUERY_MIN_LENGTH) {
          return { status: 200 as const, body: { items: [] } };
        }
        const items = await this.parties.suggest(q, PARTY_SUGGESTION_LIMIT);
        // Trimmed here as well as asked for: the cap is the API's promise, not
        // the provider's.
        return {
          status: 200 as const,
          body: { items: items.slice(0, PARTY_SUGGESTION_LIMIT) },
        };
      },
    );
  }
}
