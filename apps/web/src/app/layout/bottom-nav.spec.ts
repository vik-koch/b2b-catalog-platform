import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { UserRole } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { BottomNav } from './bottom-nav';
import { MobileSearch } from './mobile-search';

/** Enough of AuthService for the panel's one session-dependent row. */
function authStub(role: UserRole | null) {
  return {
    user: signal(role === null ? null : { role }),
    hintedRole: signal(role),
    resolved: signal(true),
  };
}

async function render(url = '/catalog', role: UserRole | null = null) {
  TestBed.configureTestingModule({
    imports: [BottomNav],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AuthService, useValue: authStub(role) },
    ],
  });
  await TestBed.inject(Router).navigateByUrl(url);
  const fixture = TestBed.createComponent(BottomNav);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    el,
    more: () =>
      el.querySelector(
        'button[aria-controls="more-menu"]',
      ) as HTMLButtonElement,
    panel: () => el.querySelector('#more-menu'),
    rows: () =>
      Array.from(el.querySelectorAll<HTMLAnchorElement>('#more-menu a')),
    async rerender() {
      fixture.detectChanges();
      await fixture.whenStable();
    },
  };
}

describe('BottomNav', () => {
  beforeEach(() => localStorage.clear());

  // Five, always the same five, with the cart in the middle: a tab that came
  // and went with the session would move every other tab under the thumb that
  // had learned where they were.
  it('draws the same five tabs signed in or out', async () => {
    for (const role of [null, 'user'] as const) {
      const view = await render('/catalog', role);
      const tabs = Array.from(
        view.el.querySelectorAll('nav > div > div > *'),
      ).map((tab) => tab.tagName.toLowerCase());

      expect(tabs).toEqual([
        'app-catalog-link',
        'button',
        'app-cart-link',
        'app-account-link',
        'button',
      ]);
      TestBed.resetTestingModule();
    }
  });

  // The tap does not decide anything itself — see MobileSearch, which knows
  // whether the header's own field is still on screen.
  it('hands a search tap to the field the header lent', async () => {
    const view = await render();
    const search = TestBed.inject(MobileSearch);
    const tabs = view.el.querySelectorAll<HTMLButtonElement>(
      'nav > div > div > button',
    );

    tabs[0].click();
    await view.rerender();

    expect(search.open()).toBe(true);
  });

  it('opens the panel on the company pages the deployment lists', async () => {
    const view = await render();
    expect(view.panel()).toBeNull();

    view.more().click();
    await view.rerender();

    const hrefs = view.rows().map((row) => row.getAttribute('href'));
    for (const slug of defaultDeploymentConfig.pages.headerNav) {
      expect(hrefs).toContain(`/${slug}`);
    }
  });

  // What a session adds goes here rather than into a tab of its own.
  it('offers the order history to a signed-in customer only', async () => {
    const guest = await render('/catalog', null);
    guest.more().click();
    await guest.rerender();
    expect(guest.rows().map((row) => row.getAttribute('href'))).not.toContain(
      '/account/orders',
    );

    TestBed.resetTestingModule();
    const customer = await render('/catalog', 'user');
    customer.more().click();
    await customer.rerender();
    expect(customer.rows().map((row) => row.getAttribute('href'))).toContain(
      '/account/orders',
    );
  });

  // The panel is an overlay over a row of destinations: reaching past it for
  // the cart is leaving, not a second opinion.
  it('drops the panel when a tab is used', async () => {
    const view = await render();
    view.more().click();
    await view.rerender();
    expect(view.more().getAttribute('aria-expanded')).toBe('true');
    expect(view.panel()?.className).toContain('animate-menu-rise');

    (view.el.querySelector('app-cart-link a') as HTMLElement).click();
    await view.rerender();

    // Shut, and on its way out: it sinks back into the bar rather than
    // vanishing, so it is still in the document for as long as that takes.
    expect(view.more().getAttribute('aria-expanded')).toBe('false');
    expect(view.panel()?.className).toContain('animate-menu-sink');
  });

  // On a phone the header shows one channel beside the wordmark; the other one
  // has nowhere else to be.
  it('closes the panel with the contact details', async () => {
    const view = await render();
    const { contact } = defaultDeploymentConfig;

    view.more().click();
    await view.rerender();

    const rows = view.rows();
    expect(rows.at(-2)?.getAttribute('href')).toBe(
      'tel:' + contact?.phone?.replace(/[^\d+]/g, ''),
    );
    expect(rows.at(-1)?.getAttribute('href')).toBe('mailto:' + contact?.email);
  });
  // The tell is the whole tab, not the glyph's colour: the caption is sr-only
  // down here, and accent means hover everywhere else in the app.
  it('marks the current tab with a tint and a heavier glyph', async () => {
    const view = await render('/cart');
    const current = view.el.querySelector<HTMLElement>(
      'a[aria-current="page"]',
    );

    expect(current?.getAttribute('href')).toBe('/cart');
    expect(current?.classList).toContain(
      'aria-[current=page]:not-active:before:bg-primary/10',
    );
    expect(current?.classList).toContain(
      'aria-[current=page]:[--icon-stroke-width:2.25]',
    );
    // A stroke-width attribute on the SVG outranks anything it inherits, which
    // is what left the previous marking drawing nothing.
    expect(current?.querySelector('svg')?.hasAttribute('stroke-width')).toBe(
      false,
    );
  });

  // Open, the panel is where you are, and the button is what closes it.
  it('tints the more tab while its panel is open', async () => {
    const view = await render();

    expect(view.more().classList.contains('before:bg-primary/10')).toBe(false);
    view.more().click();
    await view.rerender();

    expect(view.more().classList.contains('before:bg-primary/10')).toBe(true);
  });

  // The search tab is not a route, so nothing in the URL says it is the thing
  // being used; the field says so instead, wherever the field happens to be.
  it('lights the search tab while a search field has the caret', async () => {
    const view = await render();
    const search = TestBed.inject(MobileSearch);
    const tab = () => view.el.querySelector<HTMLButtonElement>('button');

    expect(tab()?.classList.contains('before:bg-primary/10')).toBe(false);

    search.setFocused(true);
    await view.rerender();
    expect(tab()?.classList.contains('before:bg-primary/10')).toBe(true);

    search.setFocused(false);
    await view.rerender();
    expect(tab()?.classList.contains('before:bg-primary/10')).toBe(false);
  });
});
