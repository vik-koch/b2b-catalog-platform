import { isPlatformServer } from '@angular/common';
import {
  HttpClient,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { DOCUMENT, inject, PLATFORM_ID, REQUEST } from '@angular/core';
import { createORPCClient, type ClientOptions } from '@orpc/client';
import type { StandardLinkClient } from '@orpc/client/standard';
import type { ContractRouterClient, AnyContractRouter } from '@orpc/contract';
import { StandardOpenAPILink } from '@orpc/openapi-client/standard';
import type {
  StandardRequest,
  StandardLazyResponse,
  StandardHeaders,
} from '@orpc/standard-server';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
import { lastValueFrom } from 'rxjs';
import { requireEnv } from '../../env';

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


/** oRPC's header bag → Angular's, dropping the ones it leaves unset. */
function toHttpHeaders(headers: StandardHeaders): HttpHeaders {
  let result = new HttpHeaders();
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    for (const entry of Array.isArray(value) ? value : [value]) {
      result = result.append(name, entry);
    }
  }
  return result;
}

/** Angular's header bag → oRPC's. */
function toStandardHeaders(headers: HttpHeaders): StandardHeaders {
  const result: StandardHeaders = {};
  for (const name of headers.keys()) {
    const values = headers.getAll(name) ?? [];
    result[name.toLowerCase()] = values.length > 1 ? values : values[0];
  }
  return result;
}

/**
 * oRPC's transport seam, implemented over Angular's HttpClient rather than
 * `fetch`. Going through HttpClient is not a preference: the SSR transfer
 * cache is an HttpClient interceptor, so a request made with `fetch` is
 * invisible to it and every server-rendered response would be refetched on
 * hydration.
 */
class HttpClientLink implements StandardLinkClient<Record<never, never>> {
  constructor(private readonly http: HttpClient) {}

  async call(
    request: StandardRequest,
    _options: ClientOptions<Record<never, never>>,
  ): Promise<StandardLazyResponse> {
    // The whole URL goes through as one string and the query is never lifted
    // into HttpParams: the transfer cache keys on both, and the two platforms
    // must produce byte-identical keys.
    const url = request.url.href;

    try {
      const response = await lastValueFrom(
        this.http.request(request.method, url, {
          body: request.body,
          headers: toHttpHeaders(request.headers),
          observe: 'response',
          responseType: 'json',
          // Deliberately no `withCredentials`/`credentials`: the API is
          // same-origin, so the browser attaches the session cookie anyway,
          // and either flag makes Angular skip the transfer cache entirely.
        }),
      );
      return {
        status: response.status,
        headers: toStandardHeaders(response.headers),
        body: async () => response.body ?? undefined,
      };
    } catch (error) {
      // HttpClient rejects every non-2xx, but oRPC expects a declared error
      // status to arrive as a *response* — that is what makes typed errors
      // reachable at the call site. Only genuine transport failures, which
      // carry no status, still throw.
      if (error instanceof HttpErrorResponse && error.status > 0) {
        return {
          status: error.status,
          headers: toStandardHeaders(error.headers),
          body: async () => error.error ?? undefined,
        };
      }
      throw error;
    }
  }
}

/**
 * Builds an oRPC client over Angular's HttpClient. Must be called in an
 * injection context (e.g. a service field initializer).
 *
 * URLs are absolute on both platforms on purpose: the SSR transfer cache keys
 * responses by the full URL string, with the server-side origin rewritten via
 * HTTP_TRANSFER_CACHE_ORIGIN_MAP (see app.config.server.ts).
 */
export function createOrpcClient<T extends AnyContractRouter>(
  contract: T,
): ContractRouterClient<T> {
  const http = inject(HttpClient);
  const onServer = isPlatformServer(inject(PLATFORM_ID));
  const document = inject(DOCUMENT);
  let origin: string | undefined;

  // Resolved on the first request, not when the service is built: API_URL
  // exists only in a running Node process, and the build's route extraction
  // boots the app — and every service its guards inject — where none is.
  const baseUrl = () =>
    (origin ??= onServer
      ? requireEnv('API_URL')
      : `${document.location.origin}/api`);

  const link = new StandardOpenAPILink(contract, new HttpClientLink(http), {
    // A function, so the origin is resolved per request rather than when the
    // client is built.
    url: () => baseUrl(),
  });

  return createORPCClient(link);
}
