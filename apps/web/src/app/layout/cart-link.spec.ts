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

/** €10.00 a piece, so two of them come to a whole amount. */
const wholePrices = { pieceLotMinor: 1000, pack: null, box: null };

function addition(overrides: Partial<CartAddition> = {}): CartAddition {
  return {
    slug: 'espresso-roast',
    name: 'Espresso Roast',
    unit: 'piece',
    quantity: 1,
    note: null,
    prices: { pieceLotMinor: 1250, pack: null, box: null },
    packaging: { ...plainPackaging },
    ...overrides,
  };
}

async function render(platformId = 'browser') {
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
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;

  return {
    cart,
    link: () => el.querySelector('a'),
    text: () => normalize(el.textContent),
    // The figures live on <html>, not in the markup — see cart-link.ts. What
    // the stylesheet would draw is what these read back.
    figures: () => {
      const root = document.documentElement;
      return root.classList.contains('cart-filled')
        ? {
            count: JSON.parse(root.style.getPropertyValue('--cart-count')),
            total: normalize(
              JSON.parse(root.style.getPropertyValue('--cart-total')),
            ),
          }
        : null;
    },
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

/** The figures live on <html>, which outlives a TestBed — so a cart left
 * behind by one spec would otherwise look like the next one's. */
function clearFigures(): void {
  document.documentElement.classList.remove('cart-filled');
  document.documentElement.style.removeProperty('--cart-count');
  document.documentElement.style.removeProperty('--cart-total');
}

describe('CartLink', () => {
  beforeEach(() => {
    localStorage.clear();
    clearFigures();
  });
  afterEach(clearFigures);

  it('links to the cart', async () => {
    const view = await render();

    expect(view.link()?.getAttribute('href')).toBe('/cart');
  });

  it('shows nothing but the label while the cart is empty', async () => {
    const view = await render();

    expect(view.text()).toBe(text.navLabel);
    expect(view.figures()).toBeNull();
    // The spoken label carries the exact figure; only the chip is shortened.
    expect(view.ariaLabel()).toBe('Cart: 0 lines, 0,00 €');
  });

  it('counts the lines and totals them from what the cart stored', async () => {
    const view = await render();

    view.cart.add(addition({ quantity: 2 }));
    view.cart.add(addition({ slug: 'filter-roast', quantity: 1 }));
    await view.rerender();

    // The chip drops the cents; the spoken label, which costs no width, does
    // not.
    expect(view.figures()).toEqual({ count: '2', total: '38 €' });
    expect(view.ariaLabel()).toBe('Cart: 2 lines, 37,50 €');
  });

  // A fraction that is not zero cannot be dropped without losing money on
  // screen; a whole amount can, and usually should.
  it('writes a whole total without its decimals', async () => {
    const view = await render();

    view.cart.add(addition({ quantity: 2, prices: wholePrices }));
    await view.rerender();

    expect(view.figures()?.total).toBe('20 €');
  });

  // Emptying the cart has to put the label back — the stylesheet keys the swap
  // on the class, so leaving it behind would leave an empty chip in the navbar.
  it('takes the figures down again when the cart is emptied', async () => {
    const view = await render();
    view.cart.add(addition());
    await view.rerender();

    view.cart.clear();
    await view.rerender();

    expect(view.figures()).toBeNull();
    expect(view.text()).toBe(text.navLabel);
  });

  // The server cannot read localStorage, so anything it emitted would be an
  // empty cart the hydrated app immediately contradicts.
  it('emits no figures at all on the server', async () => {
    const view = await render('server');
    view.cart.add(addition({ quantity: 2 }));
    await view.rerender();

    expect(view.text()).toBe(text.navLabel);
    expect(view.figures()).toBeNull();
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
});
