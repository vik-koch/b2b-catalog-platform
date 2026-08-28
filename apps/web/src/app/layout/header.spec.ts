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

  // On desktop the number and address are spelled out in the utility bar;
  // a phone viewport has no such bar, so the panel is the only place left.
  it('closes the mobile panel with the contact details', async () => {
    const { el, fixture } = await render('/catalog');
    const { contact } = defaultDeploymentConfig;

    // The utility bar's pill is the only place to dial from while the panel
    // is shut: the action group's one-tap icon is gone.
    expect(el.querySelectorAll('a[href^="tel:"]')).toHaveLength(1);

    (
      el.querySelector('button[aria-controls="mobile-menu"]') as HTMLElement
    ).click();
    await fixture.whenStable();

    const rows = Array.from(
      el.querySelectorAll<HTMLAnchorElement>('#mobile-menu a'),
    );
    expect(rows.at(-2)?.getAttribute('href')).toBe(
      'tel:' + contact?.phone?.replace(/[^\d+]/g, ''),
    );
    expect(rows.at(-1)?.getAttribute('href')).toBe('mailto:' + contact?.email);
  });

  // Both panels are mobile-only overlays over a row of destinations: reaching
  // past one for the cart or the account is leaving, not a second opinion.
  it('drops whichever panel is open when a navbar destination is used', async () => {
    const { el, fixture } = await render('/catalog');
    const open = (controls: string) =>
      (
        el.querySelector(`button[aria-controls="${controls}"]`) as HTMLElement
      ).click();
    const cart = () => el.querySelector('app-cart-link a') as HTMLAnchorElement;

    open('mobile-menu');
    await fixture.whenStable();
    expect(el.querySelector('#mobile-menu')).not.toBeNull();

    cart().click();
    await fixture.whenStable();
    expect(el.querySelector('#mobile-menu')).toBeNull();

    open('mobile-search');
    await fixture.whenStable();
    expect(el.querySelector('#mobile-search')).not.toBeNull();

    cart().click();
    await fixture.whenStable();
    expect(el.querySelector('#mobile-search')).toBeNull();
  });

  it('does not steal focus when the field opens on its own', async () => {
    const { el } = await render('/search?q=espresso');

    expect(document.activeElement).not.toBe(el.querySelector('input'));
  });
});
