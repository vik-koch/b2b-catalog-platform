import {
  HTTP_TRANSFER_CACHE_ORIGIN_MAP,
  HttpRequest,
  provideHttpClient,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { PLATFORM_ID, TransferState, makeStateKey } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideClientHydration } from '@angular/platform-browser';
import { oc } from '@orpc/contract';
import { z } from 'zod';
import { createOrpcClient } from './orpc-client';

const API_ORIGIN = 'http://api.internal:3000';
/** Mirrors the deployed `API_URL`, whose `/api` suffix matters: the transfer
 * cache origin map rewrites the origin only, so the two platforms' paths have
 * to line up on their own. */
const API_URL = `${API_ORIGIN}/api`;
/** The jsdom document's own origin — the browser client derives its base URL
 * from it, so the tests must expect the same one. */
const PUBLIC_ORIGIN = globalThis.location.origin;

/** Lets a pending request reach the testing backend: oRPC encodes the request
 * asynchronously, so nothing is in flight until the microtask queue drains. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** A miniature of the real page contract: a path param, a query, a typed error. */
const contract = {
  getPage: oc
    .route({ method: 'GET', path: '/pages/{slug}' })
    .errors({ NOT_FOUND: { status: 404 } })
    .input(z.object({ slug: z.string(), draft: z.boolean().optional() }))
    .output(z.object({ title: z.string() })),
  updatePage: oc
    .route({ method: 'PUT', path: '/pages/{slug}' })
    .input(z.object({ slug: z.string(), title: z.string() }))
    .output(z.object({ title: z.string() })),
};

interface Harness {
  client: ReturnType<typeof createOrpcClient<typeof contract>>;
  httpMock: HttpTestingController;
  transfer: TransferState;
}

function setUp(platform: 'browser' | 'server'): Harness {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideClientHydration(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: platform },
      ...(platform === 'server'
        ? [
            {
              provide: HTTP_TRANSFER_CACHE_ORIGIN_MAP,
              useValue: { [new URL(API_URL).origin]: PUBLIC_ORIGIN },
            },
          ]
        : []),
    ],
  });
  return {
    client: TestBed.runInInjectionContext(() => createOrpcClient(contract)),
    httpMock: TestBed.inject(HttpTestingController),
    transfer: TestBed.inject(TransferState),
  };
}

describe('createOrpcClient', () => {
  const originalServerMode = (globalThis as Record<string, unknown>)[
    'ngServerMode'
  ];

  beforeEach(() => {
    process.env['API_URL'] = API_URL;
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>)['ngServerMode'] =
      originalServerMode;
  });

  it('sends a GET through HttpClient with the path param and query in the URL', async () => {
    const { client, httpMock } = setUp('browser');

    const pending = client.getPage({ slug: 'privacy', draft: true });
    await flushMicrotasks();
    const request = httpMock.expectOne((r: HttpRequest<unknown>) =>
      r.url.startsWith(`${PUBLIC_ORIGIN}/api/pages/privacy`),
    );

    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('json');
    expect(request.request.url).toContain('draft=true');
    // HttpParams must stay empty — the query belongs to the URL string, which
    // is what the transfer cache keys on.
    expect(request.request.params.keys()).toEqual([]);

    request.flush({ title: 'Privacy' });
    await expect(pending).resolves.toEqual({ title: 'Privacy' });
    httpMock.verify();
  });

  it('never sets credentials, which would silently disable the transfer cache', async () => {
    const { client, httpMock } = setUp('browser');

    const pending = client.getPage({ slug: 'about' });
    await flushMicrotasks();
    const request = httpMock.expectOne(() => true);

    expect(request.request.withCredentials).toBe(false);
    expect(request.request.credentials).toBeUndefined();

    request.flush({ title: 'About' });
    await pending;
  });

  it('surfaces a declared error status as a typed error, not a transport throw', async () => {
    const { client, httpMock } = setUp('browser');

    const pending = client.getPage({ slug: 'missing' });
    await flushMicrotasks();
    httpMock
      .expectOne(() => true)
      .flush(
        { defined: true, code: 'NOT_FOUND', status: 404, message: 'nope' },
        { status: 404, statusText: 'Not Found' },
      );

    await expect(pending).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('sends a PUT body as JSON', async () => {
    const { client, httpMock } = setUp('browser');

    const pending = client.updatePage({ slug: 'about', title: 'New' });
    await flushMicrotasks();
    const request = httpMock.expectOne(() => true);

    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ title: 'New' });

    request.flush({ title: 'New' });
    await pending;
  });

  // The one that matters: a response rendered on the server must be replayed
  // from the transfer cache in the browser rather than refetched. That only
  // happens if both platforms compute the same cache key, which depends on the
  // request URL, method, responseType, body and params matching exactly after
  // the server origin is mapped to the public one.
  it('replays a server-rendered GET from the transfer cache on hydration', async () => {
    (globalThis as Record<string, unknown>)['ngServerMode'] = true;
    const server = setUp('server');

    const rendered = server.client.getPage({ slug: 'privacy' });
    await flushMicrotasks();
    const serverRequest = server.httpMock.expectOne(() => true);
    expect(serverRequest.request.url).toBe(`${API_URL}/pages/privacy`);
    serverRequest.flush({ title: 'Privacy' });
    await rendered;

    const transferred = JSON.parse(server.transfer.toJson()) as Record<
      string,
      unknown
    >;
    expect(Object.keys(transferred)).toHaveLength(1);

    (globalThis as Record<string, unknown>)['ngServerMode'] = false;
    const browser = setUp('browser');
    for (const [key, value] of Object.entries(transferred)) {
      browser.transfer.set(makeStateKey(key), value);
    }

    await expect(browser.client.getPage({ slug: 'privacy' })).resolves.toEqual({
      title: 'Privacy',
    });
    await flushMicrotasks();
    // Nothing went to the network.
    browser.httpMock.verify();
  });
});
