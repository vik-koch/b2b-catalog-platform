import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { CartAddition, CartService } from '../cart/cart.service';
import { plainPackaging } from '../catalog/product.fixture';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { CartLink } from './cart-link';

const text = defaultAppText.cart;

function normalize(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function addition(overrides: Partial<CartAddition> = {}): CartAddition {
  return {
    slug: 'espresso-roast',
    name: 'Espresso Roast',
    unit: 'piece',
    pieces: 1,
    note: null,
    image: null,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    prices: {
      pieceMilliMinor: 1250,
      pieceLotMinor: 1250,
      pack: null,
      box: null,
    },
    packaging: { ...plainPackaging },
    ...overrides,
  };
}

async function render(platformId = 'browser', variant: 'bar' | 'tab' = 'bar') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CartLink],
    providers: [
      provideRouter([{ path: 'cart', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  });

  const cart = TestBed.inject(CartService);
  const fixture = TestBed.createComponent(CartLink);
  fixture.componentRef.setInput('variant', variant);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;

  return {
    cart,
    link: () => el.querySelector('a'),
    text: () => normalize(el.textContent),
    // The header's caption steps aside for the total chip; the bottom bar's
    // does not, and says so by carrying no `cart-label` for the stylesheet to
    // key on. What each control offers the stylesheet is the whole of the
    // difference — see cart-figures.ts for where the figures come from.
    chip: () => el.querySelector('.cart-total'),
    caption: () => el.querySelector('.cart-label'),
    // Intl separates a currency with a non-breaking space, which nothing in a
    // spec should have to spell out.
    ariaLabel: () =>
      normalize(el.querySelector('a')?.getAttribute('aria-label')),
    async rerender() {
      fixture.detectChanges();
      await fixture.whenStable();
    },
  };
}

describe('CartLink', () => {
  beforeEach(() => localStorage.clear());

  it('links to the cart', async () => {
    const view = await render();

    expect(view.link()?.getAttribute('href')).toBe('/cart');
  });

  it('shows nothing but the label while the cart is empty', async () => {
    const view = await render();

    expect(view.text()).toBe(text.navLabel);
    // The spoken label carries the exact figure; only the chip is shortened.
    expect(view.ariaLabel()).toBe('Cart: 0 lines, 0,00 €');
  });

  // The server cannot read localStorage, so anything it announced would be an
  // empty cart the hydrated app immediately contradicts.
  it('announces no figure at all on the server', async () => {
    const view = await render('server');
    view.cart.add(addition({ pieces: 2 }));
    await view.rerender();

    expect(view.text()).toBe(text.navLabel);
    // Not even the accessible name, which would otherwise announce a total
    // that the visitor's own browser is about to replace.
    expect(view.ariaLabel()).toBe(text.navLabel);
  });

  it('marks itself as the current page on the cart', async () => {
    const view = await render();
    expect(view.link()?.getAttribute('aria-current')).toBeNull();

    await TestBed.inject(Router).navigateByUrl('/cart');
    await view.rerender();

    expect(view.link()?.getAttribute('aria-current')).toBe('page');
  });

  it('offers the stylesheet a total to swap in, in the header', async () => {
    const view = await render();

    expect(view.chip()).not.toBeNull();
    expect(view.caption()).not.toBeNull();
  });

  // A fifth of a phone's width, with the caption always showing: the badge is
  // the whole of what a glance needs there, and the figure is one tap away.
  it('draws no total in the bottom bar, and keeps its caption', async () => {
    const view = await render('browser', 'tab');

    expect(view.chip()).toBeNull();
    expect(view.caption()).toBeNull();
    expect(view.text()).toBe(text.navLabel);
  });
});
