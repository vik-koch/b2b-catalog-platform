import { Logger } from '@nestjs/common';
import * as z from 'zod';

/** A suggestion is an accelerator, never a step: a stalled call must leave the
 * customer typing, not waiting. */
const TIMEOUT_MS = 2000;

/**
 * The deployment's suggestion sidecar, one path per subject. Every failure
 * answers no items and never throws: unreachable, non-2xx (a 404 from a
 * sidecar older than the path), an unreadable body or a refused shape.
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
      // A deployment's own code: checked, not trusted.
      const parsed = schema.safeParse(await response.json());
      if (!parsed.success) {
        this.logger.warn('Suggestion sidecar answered an unexpected shape');
        return [];
      }
      return parsed.data.items;
    } catch (error) {
      // Without the query: it is the customer's address or company.
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
