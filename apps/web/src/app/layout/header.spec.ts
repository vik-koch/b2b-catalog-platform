import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { Header } from './header';

async function render(url = '/') {
  TestBed.configureTestingModule({
    imports: [Header],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(Header);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** The mobile search toggle, identified by what it controls. */
function toggle(el: HTMLElement): HTMLButtonElement {
  return el.querySelector(
    'button[aria-controls="mobile-search"]',
  ) as HTMLButtonElement;
}

describe('Header', () => {
  it('collapses mobile search behind the toggle off the results page', async () => {
    const { el, fixture } = await render('/catalog');

    expect(el.querySelector('#mobile-search')).toBeNull();
    expect(toggle(el).disabled).toBe(false);

    toggle(el).click();
    await fixture.whenStable();

    expect(el.querySelector('#mobile-search')).not.toBeNull();
  });

  it('keeps the mobile field open on the results page, with nothing left to toggle', async () => {
    const { el } = await render('/search?q=espresso');

    // The field carries the query being viewed, so it is part of the page
    // rather than an overlay — and the toggle would only be able to hide it.
    expect(el.querySelector('#mobile-search')).not.toBeNull();
    expect(toggle(el).disabled).toBe(true);
  });

  it('does not steal focus when the field opens on its own', async () => {
    const { el } = await render('/search?q=espresso');

    expect(document.activeElement).not.toBe(el.querySelector('input'));
  });
});
