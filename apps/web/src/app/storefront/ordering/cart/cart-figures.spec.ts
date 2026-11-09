import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CartAddition } from '../../../core/catalog/buying/product-cart';
import { plainPackaging } from '../../../core/catalog/product.fixture';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { CartFigures } from './cart-figures';
import { CartService } from './cart.service';

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** €10.00 a piece, so two of them come to a whole amount. */
const wholePrices = {
  piece: 1000,
  pack: null,
  box: null,
};

function addition(overrides: Partial<CartAddition> = {}): CartAddition {
  return {
    slug: 'espresso-roast',
    name: 'Espresso Roast',
    unit: 'piece',
    pieces: 1,
    note: null,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    pairedCount: 0,
    parts: [],
    variants: [],
    images: [],
    availability: null,
    image: null,
    prices: {
      piece: 1250,
      pack: null,
      box: null,
    },
    packaging: { ...plainPackaging },
    ...overrides,
  };
}

function render(platformId = 'browser') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: PLATFORM_ID, useValue: platformId },
    ],
  });

  const cart = TestBed.inject(CartService);
  TestBed.inject(CartFigures);

  return {
    cart,
    // The figures live on <html>, not in markup (cart-figures.ts); this reads
    // back what the stylesheet would draw.
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
    /** Effects run on the next tick; nothing here needs a component. */
    settle: () => TestBed.tick(),
  };
}

/** The figures live on <html>, which outlives a TestBed, so one spec's cart
 * would look like the next one's. */
function clearFigures(): void {
  document.documentElement.classList.remove('cart-filled');
  document.documentElement.style.removeProperty('--cart-count');
  document.documentElement.style.removeProperty('--cart-total');
}

describe('CartFigures', () => {
  beforeEach(() => {
    localStorage.clear();
    clearFigures();
  });
  afterEach(clearFigures);

  it('writes nothing while the cart is empty', () => {
    const view = render();
    view.settle();

    expect(view.figures()).toBeNull();
  });

  it('counts the lines and totals them from what the cart stored', () => {
    const view = render();

    view.cart.add(addition({ pieces: 2 }));
    view.cart.add(addition({ slug: 'filter-roast', pieces: 1 }));
    view.settle();

    // The chip drops the cents: a figure that changes width with them moves
    // every icon in the navbar.
    expect(view.figures()).toEqual({ count: '2', total: '38 €' });
  });

  // A fraction that is not zero cannot be dropped without losing money on
  // screen; a whole amount can, and usually should.
  it('writes a whole total without its decimals', () => {
    const view = render();

    view.cart.add(addition({ pieces: 2, prices: wholePrices }));
    view.settle();

    expect(view.figures()?.total).toBe('20 €');
  });

  // Emptying puts the caption back: the stylesheet keys on the class, so a
  // leftover would leave an empty chip.
  it('takes the figures down again when the cart is emptied', () => {
    const view = render();
    view.cart.add(addition());
    view.settle();

    view.cart.clear();
    view.settle();

    expect(view.figures()).toBeNull();
  });

  // The server cannot read localStorage, so anything it emitted would be an
  // empty cart the hydrated app immediately contradicts.
  it('emits no figures at all on the server', () => {
    const view = render('server');
    view.cart.add(addition({ pieces: 2 }));
    view.settle();

    expect(view.figures()).toBeNull();
  });
});
