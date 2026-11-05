import { SHARED_TEXT } from '../../platform/config/shared-text';
import { defaultSharedText } from '../../platform/config/shared-text.fixture';
import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { defaultStorefrontText } from '../../platform/config/storefront-text.fixture';
import { LoadErrorView } from './load-error-view';

/** The status is the point: an apology in a 200 gets indexed, and the
 * Traefik access logs, the request-level signal, report a healthy site in an
 * outage. */
function render(responseInit?: ResponseInit) {
  TestBed.configureTestingModule({
    imports: [LoadErrorView],
    providers: [
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      ...(responseInit
        ? [{ provide: RESPONSE_INIT, useValue: responseInit }]
        : []),
    ],
  });
  const fixture = TestBed.createComponent(LoadErrorView);
  fixture.detectChanges();
  return fixture;
}

describe('LoadErrorView', () => {
  it('sets a 503 on the server response', () => {
    const responseInit: ResponseInit = {};

    render(responseInit);

    expect(responseInit.status).toBe(503);
  });

  it('renders without a response token in the browser', () => {
    const fixture = render();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      defaultStorefrontText.errors.cannotLoadBody,
    );
  });

  it('renders a heading only when given one', () => {
    const fixture = render();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('h1'),
    ).toBeNull();

    fixture.componentRef.setInput('heading', 'Cannot load page');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent,
    ).toContain('Cannot load page');
  });
});
