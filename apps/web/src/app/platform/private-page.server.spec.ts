import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { keepPagePrivate } from './private-page.server';

const URL = 'http://api.internal:3000/api/catalog/featured';

/** The page's Cache-Control after one read, sent with `sent` and answered
 * with `answered`. */
function pageAfter(
  sent: Record<string, string>,
  answered: Record<string, string>,
): string | null {
  const page: ResponseInit = { headers: new Headers() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([keepPagePrivate])),
      provideHttpClientTesting(),
      { provide: RESPONSE_INIT, useValue: page },
    ],
  });
  TestBed.inject(HttpClient).get(URL, { headers: sent }).subscribe();
  TestBed.inject(HttpTestingController)
    .expectOne(URL)
    .flush({}, { headers: answered });
  return new Headers(page.headers).get('cache-control');
}

describe('keepPagePrivate', () => {
  it('leaves a page built from public answers alone', () => {
    expect(pageAfter({}, {})).toBeNull();
    expect(pageAfter({}, { 'Cache-Control': 'public, max-age=60' })).toBeNull();
  });

  it('marks the page private when a read carried a credential', () => {
    expect(pageAfter({ cookie: 'session=a-token' }, {})).toBe(
      'private, no-store',
    );
    expect(pageAfter({ authorization: 'Bearer x' }, {})).toBe(
      'private, no-store',
    );
  });

  it('marks it private when an answer was, whoever asked', () => {
    for (const cacheControl of [
      'private',
      'no-store',
      'no-cache',
      'max-age=0, Private',
    ]) {
      expect(pageAfter({}, { 'Cache-Control': cacheControl })).toBe(
        'private, no-store',
      );
    }
    expect(pageAfter({}, { 'Set-Cookie': 'a=b' })).toBe('private, no-store');
  });

  it('passes through where there is no page to mark', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([keepPagePrivate])),
        provideHttpClientTesting(),
      ],
    });
    TestBed.inject(HttpClient).get(URL).subscribe();
    TestBed.inject(HttpTestingController).expectOne(URL).flush({});
  });
});
