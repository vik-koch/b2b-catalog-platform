import { Injectable } from '@angular/core';
import {
  PartySuggestion,
  partySuggestionContract,
} from '@b2b-catalog-platform/shared';
import { createApiClient } from '../core/api-client';

/**
 * Companies matching what is being typed (FR-AUTH-09). A deployment with no
 * sidecar configured answers with an empty list, so the field simply never
 * offers anything — there is nothing here to switch on.
 */
@Injectable({ providedIn: 'root' })
export class PartiesService {
  private readonly client = createApiClient(partySuggestionContract);

  async suggest(q: string): Promise<PartySuggestion[]> {
    const response = await this.client.suggestParties({ query: { q } });
    // A suggestion is an accelerator, never a step: a provider that is down or
    // out of quota must not take the registration form down with it.
    return response.status === 200 ? response.body.items : [];
  }
}
