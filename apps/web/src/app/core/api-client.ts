import { isPlatformServer } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { DOCUMENT, inject, PLATFORM_ID, REQUEST } from '@angular/core';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
import { AppRouter, initClient } from '@ts-rest/core';
import { lastValueFrom } from 'rxjs';
import { requireEnv } from '../../env';

/** Angular's header bag → the fetch-style `Headers` ts-rest hands to callers. */
function toFetchHeaders(headers: HttpHeaders): Headers {
  return new Headers(
    headers
      .keys()
      .map((key): [string, string] => [key, headers.get(key) ?? '']),
  );
}

/** Whether this render's visitor has a session — the cookie's presence only;
 * its value is httpOnly and the API's business. False in the browser. */
function hasSessionCookie(): boolean {
  const cookies = inject(REQUEST)?.headers.get('cookie');
  return !!cookies && new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=`).test(cookies);
}

/**
 * Whether a read whose answer depends on the visitor must be left to the
 * browser: true when the server is rendering for someone with a session. It
 * never forwards the cookie, so the only answer it could get is the guest one —
 * rendering that would paint default prices at a customer. The page is served
 * in its loading state and the browser, which does send the cookie, fills it in.
 * Guests and crawlers keep the full server render.
 *
 * Call in an injection context; hold the answer, it cannot change for a render.
 */
export function deferSessionReads(): boolean {
  return isPlatformServer(inject(PLATFORM_ID)) && hasSessionCookie();
}

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
      try {
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
          headers: toFetchHeaders(response.headers),
        };
      } catch (error) {
        // HttpClient rejects on every non-2xx, but ts-rest expects each status
        // the contract declares to come back as a *response* — that is what
        // makes typed error bodies (e.g. login's 401) reachable at the call
        // site. Hand those back; only genuine transport failures, which have
        // no status, still throw.
        if (error instanceof HttpErrorResponse && error.status > 0) {
          return {
            status: error.status,
            body: error.error,
            headers: toFetchHeaders(error.headers),
          };
        }
        throw error;
      }
    },
  });
}
