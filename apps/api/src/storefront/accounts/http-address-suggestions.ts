import { Logger } from '@nestjs/common';
import * as z from 'zod';
import { SuggestionSidecar } from '../../platform/suggestions/sidecar';
import {
  AddressSuggestionPort,
  AddressSuggestionResult,
  NoAddressSuggestions,
} from './address-suggestion.port';
import { addressSuggestionSchema } from '@b2b-catalog-platform/shared/core/accounts';

const responseSchema = z.object({ items: z.array(addressSuggestionSchema) });

/** `GET {base}/suggest?q=&country=&limit=` answering `{ items }`. The
 * provider, its quirks and its credential stay in the sidecar. */
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

/** The sidecar URL is the only switch. The choice is logged at boot, or a
 * misspelled variable would turn suggestions off unnoticed. */
export function createAddressSuggestionPort(
  url: string | undefined,
): AddressSuggestionPort {
  const logger = new Logger('AddressSuggestions');
  if (!url) {
    logger.log('disabled: no SUGGESTION_SIDECAR_URL, addresses are typed');
    return new NoAddressSuggestions();
  }
  logger.log(`enabled: suggestion sidecar at ${url}`);
  return new HttpAddressSuggestions(url);
}
