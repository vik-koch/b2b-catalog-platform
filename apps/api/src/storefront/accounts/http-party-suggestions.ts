import { Logger } from '@nestjs/common';
import * as z from 'zod';
import { SuggestionSidecar } from '../../platform/suggestions/sidecar';
import {
  NoPartySuggestions,
  PartySuggestionPort,
} from './party-suggestion.port';
import {
  PartySuggestion,
  partySuggestionSchema,
} from '@b2b-catalog-platform/shared/core/accounts';

const responseSchema = z.object({ items: z.array(partySuggestionSchema) });

/** `GET {base}/suggest-party?q=&limit=` answering `{ items }`. An older
 * sidecar answers 404, which reads as no suggestions. */
export class HttpPartySuggestions implements PartySuggestionPort {
  private readonly sidecar: SuggestionSidecar;

  constructor(baseUrl: string) {
    this.sidecar = new SuggestionSidecar(
      baseUrl,
      new Logger(HttpPartySuggestions.name),
    );
  }

  async suggest(query: string, limit: number): Promise<PartySuggestion[]> {
    return this.sidecar.get(
      'suggest-party',
      { q: query, limit },
      responseSchema,
    );
  }
}

/** The same sidecar URL as addresses, logged at boot for the same reason. */
export function createPartySuggestionPort(
  url: string | undefined,
): PartySuggestionPort {
  const logger = new Logger('CompanySuggestions');
  if (!url) {
    logger.log('disabled: no SUGGESTION_SIDECAR_URL, companies are typed');
    return new NoPartySuggestions();
  }
  logger.log(`enabled: suggestion sidecar at ${url}`);
  return new HttpPartySuggestions(url);
}
