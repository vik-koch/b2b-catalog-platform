import { Injectable } from '@angular/core';
import { safe } from '@orpc/client';

import { PartySuggestion } from '@b2b-catalog-platform/shared/core/accounts';

import { createOrpcClient } from '../../../platform/orpc-client';
import { partySuggestionContract } from '../contract-routes.generated';

/** Companies matching what is typed; empty where no provider is set up. */
@Injectable({ providedIn: 'root' })
export class PartiesService {
  private readonly client = createOrpcClient(partySuggestionContract);

  async suggest(q: string): Promise<PartySuggestion[]> {
    const { error, data } = await safe(
      this.client.suggestParties({ query: { q } }),
    );
    // A provider that is down must not take the form with it.
    return error ? [] : data.items;
  }
}
