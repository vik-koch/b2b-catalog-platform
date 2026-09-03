import { PLATFORM_ID, REQUEST } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
import { deferSessionReads } from './orpc-client';

/** A render of `platform` for a visitor whose request carries `cookie`. Resets
 * first, so a test may set up more than one render. */
function renderFor(platform: 'browser' | 'server', cookie?: string): boolean {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      {
        provide: REQUEST,
        useValue: cookie
          ? new Request('https://shop.example/catalog', {
              headers: { cookie },
            })
          : null,
      },
    ],
  });
  return TestBed.runInInjectionContext(() => deferSessionReads());
}

describe('deferSessionReads', () => {
  it('defers a server render for a visitor with a session', () => {
    expect(renderFor('server', `${AUTH_COOKIE}=a-token`)).toBe(true);
  });

  it('renders normally for a guest', () => {
    expect(renderFor('server')).toBe(false);
    expect(renderFor('server', 'consent=all')).toBe(false);
  });

  it('finds the cookie among others, wherever it sits', () => {
    expect(renderFor('server', `consent=all; ${AUTH_COOKIE}=a-token`)).toBe(
      true,
    );
    expect(renderFor('server', `${AUTH_COOKIE}=a-token; consent=all`)).toBe(
      true,
    );
  });

  it('is not fooled by a cookie whose name merely ends the same way', () => {
    expect(renderFor('server', `not-a-${AUTH_COOKIE}=a-token`)).toBe(false);
  });

  it('never defers in the browser, which asks with the cookie anyway', () => {
    expect(renderFor('browser', `${AUTH_COOKIE}=a-token`)).toBe(false);
  });
});
