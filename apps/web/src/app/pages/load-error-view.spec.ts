import { RESPONSE_INIT } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { LoadErrorView } from './load-error-view';

/**
 * The status is the point of this component. Rendering an apology inside a 200
 * invites a crawler to index the error page and, worse, leaves every
 * status-based monitor — the Traefik access logs this platform treats as its
 * request-level signal — reporting a healthy site during an outage.
 */
function render(responseInit?: ResponseInit) {
  TestBed.configureTestingModule({
    imports: [LoadErrorView],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
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
      defaultAppText.errors.cannotLoadBody,
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
