import { Injectable } from '@angular/core';
import { partySuggestionContract } from '../../../shared/core/contract-routes.generated';
import { safe } from '@orpc/client';
import { createOrpcClient } from '../../../shared/core/orpc-client';
import { PartySuggestion } from '@b2b-catalog-platform/shared/core/accounts';

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
