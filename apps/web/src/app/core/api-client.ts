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

export interface ApiClientOptions {
  /**
   * Set for reads whose body depends on who is asking — today the catalog's
   * tier prices (FR-AUTH-05).
   *
   * Such a read is kept out of the hydration transfer cache whenever the
   * document request carries a session cookie. The SSR tier never forwards
   * that cookie, so what it would put in the document is the default-price
   * answer, and the browser would replay it instead of asking the API for the
   * customer's own — leaving a signed-in visitor on the wrong prices until
   * they navigated. Skipping the cache costs them one request and gets it
   * right; a guest's document is unaffected, cache and all.
   */
  sessionSensitive?: boolean;
}

/**
 * Whether the visitor this render is for has a session — the cookie's presence,
 * never its value, which is httpOnly and the API's business. Always false in
 * the browser, where there is no incoming request and nothing to decide.
 */
function hasSessionCookie(): boolean {
  const cookies = inject(REQUEST)?.headers.get('cookie');
  return !!cookies && new RegExp(`(?:^|;\\s*)${AUTH_COOKIE}=`).test(cookies);
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
export function createApiClient<T extends AppRouter>(
  contract: T,
  options: ApiClientOptions = {},
) {
  const http = inject(HttpClient);
  const isServer = isPlatformServer(inject(PLATFORM_ID));
  const baseUrl = isServer
    ? requireEnv('API_URL')
    : `${inject(DOCUMENT).location.origin}/api`;
  // Undefined leaves Angular's default (cache it) in place; only a
  // session-sensitive read on a server render for a signed-in visitor opts out.
  const transferCache =
    isServer && options.sessionSensitive && hasSessionCookie()
      ? false
      : undefined;

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
            transferCache,
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
