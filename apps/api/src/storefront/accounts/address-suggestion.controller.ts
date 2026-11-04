import { Controller, Inject } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { SidecarSuggestionThrottle } from '../../platform/throttling/throttle-presets';
import {
  ADDRESS_SUGGESTION_PORT,
  AddressSuggestionPort,
} from './address-suggestion.port';
import {
  ADDRESS_QUERY_MIN_LENGTH,
  ADDRESS_SUGGESTION_LIMIT,
  addressSuggestionContract,
} from '@b2b-catalog-platform/shared/core/accounts';

/**
 * Address suggestions (FR-CART-11, NFR-SEC-08). Open, since a guest fills
 * the same form at checkout, and throttled hard: each call may cost money.
 * A short query never reaches the provider.
 */
@Controller()
export class AddressSuggestionController {
  constructor(
    @Inject(ADDRESS_SUGGESTION_PORT)
    private readonly suggestions: AddressSuggestionPort,
  ) {}

  @SidecarSuggestionThrottle()
  @Implement(addressSuggestionContract.suggestAddresses)
  suggestAddresses() {
    return implement(addressSuggestionContract.suggestAddresses).handler(
      async ({ input: { query } }) => {
        const q = query.q.trim();
        if (q.length < ADDRESS_QUERY_MIN_LENGTH) return { items: [] };

        const items = await this.suggestions.suggest(
          q,
          query.country,
          ADDRESS_SUGGESTION_LIMIT,
        );
        // The cap is the API's promise, not the provider's.
        return { items: items.slice(0, ADDRESS_SUGGESTION_LIMIT) };
      },
    );
  }
}
