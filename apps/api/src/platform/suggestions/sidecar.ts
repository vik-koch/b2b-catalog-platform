import { Logger } from '@nestjs/common';
import * as z from 'zod';

/**
 * A provider is an accelerator, never a step: a sidecar that is slow, down or
 * answering nonsense must leave the customer typing, not leave them waiting.
 * Short enough that a stalled call costs less than the debounce it followed.
 */
const TIMEOUT_MS = 2000;

/**
 * The deployment's suggestion sidecar, as the platform speaks to it (ADR
 * 0040/0041): one small service the deployment runs, answering a fixed contract
 * on one path per subject. Both adapters share this client because they share
 * the container, the failure policy and the URL — the only thing that differs
 * is what they ask for and how the answer is shaped.
 *
 * Every failure answers with **no items**: unreachable, non-2xx (a 404 included,
 * which is how a sidecar built before a path degrades), an unreadable body, or
 * one the schema refuses. Nothing here throws at a caller.
 */
export class SuggestionSidecar {
  constructor(
    private readonly baseUrl: string,
    private readonly logger: Logger,
  ) {}

  async get<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    schema: z.ZodType<{ items: T[] }>,
  ): Promise<T[]> {
    const url = new URL(path, ensureTrailingSlash(this.baseUrl));
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(`Suggestion sidecar answered ${response.status}`);
        return [];
      }
      // Checked rather than trusted: the sidecar is a deployment's own code,
      // and a shape it gets wrong must not reach our validated response.
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        this.logger.warn('Suggestion sidecar answered an unexpected shape');
        return [];
      }
      return parsed.data.items;
    } catch (error) {
      // Logged without the query: what a customer is typing is their address,
      // and their company is who they are.
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
