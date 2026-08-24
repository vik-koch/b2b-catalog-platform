import { Controller, Inject } from '@nestjs/common';
import { tsRestHandler, TsRestHandler } from '@ts-rest/nest';
import {
  ADDRESS_QUERY_MIN_LENGTH,
  ADDRESS_SUGGESTION_LIMIT,
  addressSuggestionContract,
} from '@b2b-catalog-platform/shared';
import { AddressSuggestionThrottle } from '../throttling/throttle-presets';
import {
  ADDRESS_SUGGESTION_PORT,
  AddressSuggestionPort,
} from './address-suggestion.port';

/**
 * The suggestion proxy (FR-CART-11, NFR-SEC-08). Unauthenticated, because a
 * guest fills the same address form at checkout — and throttled harder than the
 * catalog's own suggestions, because every call here may cost the deployment
 * money at a third party.
 *
 * A query shorter than the minimum answers empty rather than reaching the
 * provider: two letters match half a country and would be a paid call for
 * nothing.
 */
@Controller()
export class AddressSuggestionController {
  constructor(
    @Inject(ADDRESS_SUGGESTION_PORT)
    private readonly suggestions: AddressSuggestionPort,
  ) {}

  @AddressSuggestionThrottle()
  @TsRestHandler(addressSuggestionContract.suggestAddresses, {
    validateResponses: true,
  })
  suggestAddresses() {
    return tsRestHandler(
      addressSuggestionContract.suggestAddresses,
      async ({ query }) => {
        const q = query.q.trim();
        if (q.length < ADDRESS_QUERY_MIN_LENGTH) {
          return { status: 200 as const, body: { items: [] } };
        }
        const items = await this.suggestions.suggest(
          q,
          query.country,
          ADDRESS_SUGGESTION_LIMIT,
        );
        // Trimmed here as well as asked for: the cap is the API's promise, not
        // the provider's.
        return {
          status: 200 as const,
          body: { items: items.slice(0, ADDRESS_SUGGESTION_LIMIT) },
        };
      },
    );
  }
}
