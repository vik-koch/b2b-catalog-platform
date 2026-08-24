import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { addressSuggestionSchema } from '@b2b-catalog-platform/shared';
import { SuggestionSidecar } from '../suggestions/sidecar';
import {
  AddressSuggestionPort,
  AddressSuggestionResult,
} from './address-suggestion.port';

const responseSchema = z.object({ items: z.array(addressSuggestionSchema) });

/**
 * Addresses from the deployment's own sidecar (ADR 0040), which speaks a fixed
 * contract — `GET {base}/suggest?q=&country=&limit=` answering `{ items: [...] }`
 * — and the provider's protocol on the other side. The provider's name, its
 * quirks and its credential stay in that container.
 */
export class HttpAddressSuggestions implements AddressSuggestionPort {
  private readonly sidecar: SuggestionSidecar;

  constructor(baseUrl: string) {
    this.sidecar = new SuggestionSidecar(
      baseUrl,
      new Logger(HttpAddressSuggestions.name),
    );
  }

  async suggest(
    query: string,
    country: string | undefined,
    limit: number,
  ): Promise<AddressSuggestionResult[]> {
    return this.sidecar.get(
      'suggest',
      { q: query, country, limit },
      responseSchema,
    );
  }
}
