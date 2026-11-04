import { isPlatformServer } from '@angular/common';
import {
  HttpClient,
  HttpContext,
  HttpContextToken,
  HttpErrorResponse,
  HttpHeaders,
} from '@angular/common/http';
import { DOCUMENT, inject, PLATFORM_ID } from '@angular/core';
import { createORPCClient, type ClientOptions } from '@orpc/client';
import type { StandardLinkClient } from '@orpc/client/standard';
import type { ContractRouterClient, AnyContractRouter } from '@orpc/contract';
import { StandardOpenAPILink } from '@orpc/openapi-client/standard';
import type {
  StandardRequest,
  StandardLazyResponse,
  StandardHeaders,
} from '@orpc/standard-server';
import { lastValueFrom } from 'rxjs';
import { requireEnv } from '../../env';

/** A request to our API: the only kind the widened transfer cache carries. */
export const API_REQUEST = new HttpContextToken<boolean>(() => false);

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

/** oRPC over HttpClient, not `fetch`: the transfer cache is an HttpClient
 * interceptor, and a `fetch` would be asked again on hydration. */
class HttpClientLink implements StandardLinkClient<Record<never, never>> {
  constructor(private readonly http: HttpClient) {}

  async call(
    request: StandardRequest,
    _options: ClientOptions<Record<never, never>>,
  ): Promise<StandardLazyResponse> {
    // One string, never HttpParams: both platforms must make identical
    // cache keys.
    const url = request.url.href;

    try {
      const response = await lastValueFrom(
        this.http.request(request.method, url, {
          body: request.body,
          headers: toHttpHeaders(request.headers),
          context: new HttpContext().set(API_REQUEST, true),
          observe: 'response',
          responseType: 'json',
          // No `withCredentials`: same-origin sends the cookie anyway, and
          // the flag makes Angular skip the transfer cache.
        }),
      );
      return {
        status: response.status,
        headers: toStandardHeaders(response.headers),
        body: async () => response.body ?? undefined,
      };
    } catch (error) {
      // oRPC reads a declared error from a response; only a transport
      // failure, which has no status, throws.
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

/** Absolute URLs on both platforms, as the transfer cache keys on them (the
 * server's origin is mapped in app.config.server.ts). Call in an injection
 * context. */
export function createOrpcClient<T extends AnyContractRouter>(
  contract: T,
): ContractRouterClient<T> {
  const http = inject(HttpClient);
  const onServer = isPlatformServer(inject(PLATFORM_ID));
  const document = inject(DOCUMENT);
  let origin: string | undefined;

  // On the first request: the build's route extraction boots the app where
  // no API_URL exists.
  const baseUrl = () =>
    (origin ??= onServer
      ? requireEnv('API_URL')
      : `${document.location.origin}/api`);

  const link = new StandardOpenAPILink(contract, new HttpClientLink(http), {
    url: () => baseUrl(),
  });

  return createORPCClient(link);
}
