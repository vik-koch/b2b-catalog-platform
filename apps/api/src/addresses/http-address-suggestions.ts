import { Logger } from '@nestjs/common';
import { z } from 'zod';
import { addressSuggestionSchema } from '@b2b-catalog-platform/shared';
import {
  AddressSuggestionPort,
  AddressSuggestionResult,
} from './address-suggestion.port';

/**
 * A provider is an accelerator, never a step: a sidecar that is slow, down or
 * answering nonsense must leave the customer typing, not leave them waiting.
 * Short enough that a stalled call costs less than the debounce it followed.
 */
const TIMEOUT_MS = 2000;

/** The sidecar's answer, checked rather than trusted — it is a deployment's own
 * code, and a shape it gets wrong must not reach our validated response. */
const responseSchema = z.object({ items: z.array(addressSuggestionSchema) });

/**
 * The one adapter the open repository ships (ADR 0040): it speaks a fixed
 * contract to a small service the *deployment* runs beside the API —
 * `GET {base}/suggest?q=&country=&limit=` answering `{ items: [...] }`.
 *
 * The provider's own protocol and credential live in that container, in
 * whatever language suits them, so a region-specific integration needs no
 * private code inside this image and is deployed on its own schedule. The
 * sidecar sits on the internal network; its address is wiring, so it comes from
 * the environment rather than from the deployment config, which is served to
 * every browser.
 */
export class HttpAddressSuggestions implements AddressSuggestionPort {
  private readonly logger = new Logger(HttpAddressSuggestions.name);

  constructor(private readonly baseUrl: string) {}

  async suggest(
    query: string,
    country: string | undefined,
    limit: number,
  ): Promise<AddressSuggestionResult[]> {
    const url = new URL('suggest', ensureTrailingSlash(this.baseUrl));
    url.searchParams.set('q', query);
    if (country) url.searchParams.set('country', country);
    url.searchParams.set('limit', String(limit));

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Suggestion sidecar answered ${response.status}`);
        return [];
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) {
        this.logger.warn('Suggestion sidecar answered an unexpected shape');
        return [];
      }
      return parsed.data.items;
    } catch (error) {
      // Logged without the query: what a customer is typing is their address.
      this.logger.warn(
        `Suggestion sidecar unreachable: ${(error as Error).message}`,
      );
      return [];
    }
  }
}

/** `new URL('suggest', base)` drops the last path segment without one, so a
 * base of `http://host/api` would resolve to `http://host/suggest`. */
function ensureTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}
