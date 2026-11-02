import { Logger } from '@nestjs/common';
import * as z from 'zod';
import {
  PartySuggestion,
  partySuggestionSchema,
} from '@b2b-catalog-platform/shared';
import { SuggestionSidecar } from '../suggestions/sidecar';
import { PartySuggestionPort } from './party-suggestion.port';

const responseSchema = z.object({ items: z.array(partySuggestionSchema) });

/**
 * Companies from the deployment's own sidecar (ADR 0041) — the same container
 * the addresses come from, at a second path:
 * `GET {base}/suggest-party?q=&limit=` answering `{ items: [...] }`.
 *
 * A sidecar built before that path existed answers 404, which the client turns
 * into an empty list — so an older one degrades to "no company suggestions"
 * without a capability flag to keep in step.
 */
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
