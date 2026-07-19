import { isPlatformServer } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DOCUMENT, inject, PLATFORM_ID } from '@angular/core';
import { AppRouter, initClient } from '@ts-rest/core';
import { lastValueFrom } from 'rxjs';
import { requireEnv } from '../../env';

/**
 * Builds a ts-rest client over Angular's HttpClient. Must be called in an
 * injection context (e.g. a service field initializer).
 *
 * URLs are absolute on both platforms on purpose: the SSR transfer cache
 * keys responses by the full URL string, with the server-side origin
 * rewritten via HTTP_TRANSFER_CACHE_ORIGIN_MAP (see app.config.server.ts).
 * The browser must therefore request `<public origin>/api/...` — a relative
 * `/api` would never match a mapped key and every SSR'd response would be
 * refetched on hydration.
 */
export function createApiClient<T extends AppRouter>(contract: T) {
  const http = inject(HttpClient);
  const baseUrl = isPlatformServer(inject(PLATFORM_ID))
    ? requireEnv('API_URL')
    : `${inject(DOCUMENT).location.origin}/api`;

  return initClient(contract, {
    baseUrl,
    api: async ({ path, method, headers, body }) => {
      const response = await lastValueFrom(
        http.request(method, path, {
          body,
          headers,
          observe: 'response',
          responseType: 'json',
        }),
      );

      return {
        status: response.status,
        body: response.body,
        headers: new Headers(
          response.headers
            .keys()
            .map((key): [string, string] => [
              key,
              response.headers.get(key) ?? '',
            ]),
        ),
      };
    },
  });
}
