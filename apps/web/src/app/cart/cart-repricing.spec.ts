import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CartPreview } from '@b2b-catalog-platform/shared';
import { packagedPackaging } from '../catalog/product.fixture';
import { AuthService } from '../auth/auth.service';
import { CartPreviewService } from './cart-preview.service';
import { CartRepricing } from './cart-repricing';
import { CartAddition, CartService } from './cart.service';

/** Six to a pack at €70 a pack, four packs to a box — the same lot price
 * multiplied out, as the arithmetic requires. */
function addition(): CartAddition {
  return {
    slug: 'filter-roast',
    name: 'Filter Roast',
    unit: 'pack',
    pieces: 6,
    note: null,
    image: null,
    lineNoteEnabled: false,
    lineNotePrompt: null,
    prices: {
      pieceMilliMinor: 1_166_667,
      pieceLotMinor: 7000,
      pack: 7000,
      box: 28_000,
    },
    packaging: { ...packagedPackaging },
  };
}

/** The same line at the signed-in visitor's own price. */
function preview(lineTotalMinor: number | null = 6500): CartPreview {
  return {
    lines: [
      {
        slug: 'filter-roast',
        unit: 'pack',
        pieces: 6,
        note: null,
        name: 'Filter Roast',
        image: null,
        packaging: { ...packagedPackaging },
        boxVolume: null,
        boxWeight: null,
        boxCount: 1,
        lineNoteEnabled: false,
        lineNotePrompt: null,
        prices: {
          pieceMilliMinor: 1_083_333,
          pieceLotMinor: 6500,
          pack: 6500,
          box: 26_000,
        },
        lineTotalMinor,
        issues: [],
      },
    ],
    totalMinor: lineTotalMinor ?? 0,
    complete: lineTotalMinor !== null,
    shipment: {
      cartons: 0,
      volume: null,
      weight: null,
      coveredLines: 0,
      uncoveredLines: 0,
      approximate: true,
    },
  };
}

function hint(role: string | null): void {
  document.cookie =
    role === null
      ? 'session_role=; max-age=0'
      : `session_role=${role}; max-age=60`;
}

/**
 * Fills a cart as a guest, then boots with the session the hint cookie
 * describes — which is what a customer signing in and then browsing on looks
 * like from here.
 */
function boot(options: { answer?: CartPreview | Error; empty?: boolean } = {}) {
  TestBed.resetTestingModule();
  localStorage.clear();
  hint(null);
  if (!options.empty) {
    TestBed.configureTestingModule({
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    });
    TestBed.inject(CartService).add(addition());
    TestBed.resetTestingModule();
  }

  const answer = options.answer ?? preview();
  const priced = vi.fn(() =>
    answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer),
  );
  const user = signal<{ id: string } | null>(null);
  const resolved = signal(false);

  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: CartPreviewService, useValue: { preview: priced } },
      { provide: AuthService, useValue: { user, resolved } },
    ],
  });
  TestBed.inject(CartRepricing);
  const cart = TestBed.inject(CartService);

  return {
    cart,
    priced,
    /** The session answering, as the API and the hint cookie both would. */
    async signIn(role: string | null) {
      hint(role);
      user.set(role === null ? null : { id: 'u1' });
      resolved.set(true);
      TestBed.tick();
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

describe('CartRepricing', () => {
  afterEach(() => hint(null));

  it('prices a guest cart again once a signed-in session answers', async () => {
    const view = boot();

    await view.signIn('user');

    expect(view.priced).toHaveBeenCalledTimes(1);
    expect(view.cart.lines()[0].lineTotalMinor).toBe(6500);
  });

  // FR-CART-10: the tier moved every price at once, which is not news about
  // the cart.
  it('says nothing about the prices it replaces', async () => {
    const view = boot();

    await view.signIn('user');

    expect(view.cart.changes()).toEqual([]);
  });

  it('asks for nothing where the cart was already priced for this visitor', async () => {
    const view = boot();

    await view.signIn(null);

    expect(view.priced).not.toHaveBeenCalled();
  });

  it('asks for nothing on an empty cart', async () => {
    const view = boot({ empty: true });

    await view.signIn('user');

    expect(view.priced).not.toHaveBeenCalled();
  });

  // The store keeps working when the pricing call does not, here as everywhere.
  it('leaves the cart as it was when pricing fails', async () => {
    const view = boot({ answer: new Error('offline') });

    await view.signIn('user');

    expect(view.cart.lines()[0].lineTotalMinor).toBe(7000);
  });
});
