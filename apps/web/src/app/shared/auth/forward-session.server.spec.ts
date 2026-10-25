import {
  HttpClient,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
import {
  forwardSession,
  forwardVisitorAddress,
} from './forward-session.server';

const API_URL = 'http://api.internal:3000/api';

/** The cookie header `url` goes out with, from a render whose visitor sent
 * `cookie`. */
function sentWith(url: string, cookie?: string): string | null {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([forwardSession])),
      provideHttpClientTesting(),
      {
        provide: REQUEST,
        useValue: new Request('https://shop.example/catalog', {
          headers: cookie ? { cookie } : {},
        }),
      },
    ],
  });
  TestBed.inject(HttpClient).get(url).subscribe();
  const request = TestBed.inject(HttpTestingController).expectOne(url);
  request.flush({});
  return request.request.headers.get('cookie');
}

describe('forwardSession', () => {
  beforeEach(() => {
    process.env['API_URL'] = API_URL;
  });

  it('hands the API the session cookie and nothing else from the jar', () => {
    expect(
      sentWith(
        `${API_URL}/catalog/featured`,
        `consent=all; ${AUTH_COOKIE}=a-token; session_role=user`,
      ),
    ).toBe(`${AUTH_COOKIE}=a-token`);
  });

  it('sends nothing for a guest', () => {
    expect(sentWith(`${API_URL}/catalog/featured`, 'consent=all')).toBeNull();
  });

  it('never sends it anywhere but the API', () => {
    const cookie = `${AUTH_COOKIE}=a-token`;
    expect(sentWith('https://maps.example/embed', cookie)).toBeNull();
    // Same host, different path — and one that only starts like it.
    expect(sentWith('http://api.internal:3000/other', cookie)).toBeNull();
    expect(sentWith(`${API_URL}x/catalog`, cookie)).toBeNull();
  });
});

/** The X-Forwarded-For header `url` goes out with, from a render whose
 * request carried `forwarded`. */
function addressSentWith(url: string, forwarded?: string): string | null {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([forwardVisitorAddress])),
      provideHttpClientTesting(),
      {
        provide: REQUEST,
        useValue: new Request('https://shop.example/search', {
          headers: forwarded ? { 'x-forwarded-for': forwarded } : {},
        }),
      },
    ],
  });
  TestBed.inject(HttpClient).get(url).subscribe();
  const request = TestBed.inject(HttpTestingController).expectOne(url);
  request.flush({});
  return request.request.headers.get('x-forwarded-for');
}

describe('forwardVisitorAddress', () => {
  beforeEach(() => {
    process.env['API_URL'] = API_URL;
  });

  it('hands the API the address the proxy gave the render', () => {
    expect(addressSentWith(`${API_URL}/catalog/search`, '203.0.113.7')).toBe(
      '203.0.113.7',
    );
  });

  it('sends nothing when no proxy stood in front', () => {
    expect(addressSentWith(`${API_URL}/catalog/search`)).toBeNull();
  });

  it('never sends it anywhere but the API', () => {
    expect(
      addressSentWith('https://maps.example/embed', '203.0.113.7'),
    ).toBeNull();
  });
});
