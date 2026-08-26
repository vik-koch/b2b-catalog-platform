import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CartPreview } from '@b2b-catalog-platform/shared';
import { packagedPackaging, plainPackaging } from '../catalog/product.fixture';
import { CartAddition, CartService, CartStoredLine } from './cart.service';

const STORAGE_KEY = 'cart';

function service(platformId = 'browser'): CartService {
  TestBed.configureTestingModule({
    providers: [{ provide: PLATFORM_ID, useValue: platformId }],
  });
  return TestBed.inject(CartService);
}

/** €12.50 a piece, no packs or boxes. */
function pieceAddition(overrides: Partial<CartAddition> = {}): CartAddition {
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

/**
 * Six to a pack at €70 a pack, four packs to a box. Every figure is the same
 * lot price multiplied out — a pack *is* the lot here — because that is what
 * the arithmetic guarantees and a fixture that disagreed with it would be
 * testing a shop that cannot exist.
 */
function packAddition(overrides: Partial<CartAddition> = {}): CartAddition {
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
    ...overrides,
  };
}

function stored(): {
  version: number;
  lines: CartStoredLine[];
  pricedFor?: string | null;
} | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function write(payload: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

/** The readable hint beside the httpOnly session cookie, which is how the cart
 * knows who its prices were quoted to. */
function signIn(role: string | null): void {
  document.cookie =
    role === null
      ? 'session_role=; max-age=0'
      : `session_role=${role}; max-age=60`;
}

describe('CartService', () => {
  beforeEach(() => {
    localStorage.clear();
    signIn(null);
  });

  it('starts empty and stores what is added', () => {
    const cart = service();
    expect(cart.isEmpty()).toBe(true);

    expect(cart.add(pieceAddition({ pieces: 3 }))).toBe('added');

    expect(cart.count()).toBe(1);
    expect(cart.totalMinor()).toBe(3750);
    expect(cart.totalComplete()).toBe(true);
    expect(stored()?.lines[0].pieces).toBe(3);
  });

  it('records when a line was added and what it cost, from the first write', () => {
    const cart = service();
    cart.add(packAddition({ pieces: 12 }));

    const [line] = cart.lines();
    expect(line.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(line.unitPriceMinor).toBe(7000);
    expect(line.lineTotalMinor).toBe(14000);
  });

  // The identity rule: one product is one line, and the note describes that
  // line rather than splitting it.
  it('merges an addition of the same product, re-pricing the sum', () => {
    const cart = service();
    cart.add(packAddition({ pieces: 12 }));
    cart.add(packAddition({ pieces: 18 }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0].pieces).toBe(30);
    expect(cart.lines()[0].lineTotalMinor).toBe(35000);
  });

  // A unit is a lens, so two additions in different units are two piece counts
  // of the same goods: they add up, and the line reads in the newer lens.
  it('sums across units rather than opening a second line', () => {
    const cart = service();
    cart.add(packAddition({ unit: 'pack', pieces: 24 }));
    cart.add(packAddition({ unit: 'box', pieces: 24 }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0]).toMatchObject({ unit: 'box', pieces: 48 });
    expect(cart.totalMinor()).toBe(56_000);
  });

  it('answers with the line a product is held in, whichever unit that is', () => {
    const cart = service();
    cart.add(packAddition({ unit: 'box', pieces: 24 }));

    expect(cart.lineFor('filter-roast')?.unit).toBe('box');
    expect(cart.lineFor('nothing-like-it')).toBeUndefined();
  });

  it('sets an existing line outright, re-pricing it, and creates nothing', () => {
    const cart = service();
    cart.add(packAddition({ unit: 'pack', pieces: 6 }));

    cart.setLine(packAddition({ unit: 'box', pieces: 48 }));
    cart.setLine(packAddition({ slug: 'not-in-the-cart', pieces: 18 }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0]).toMatchObject({
      unit: 'box',
      pieces: 48,
      lineTotalMinor: 56_000,
    });
  });

  it('takes a newly typed note but never erases one by adding again', () => {
    const cart = service();
    cart.add(packAddition({ note: '  100 in red  ' }));
    expect(cart.lines()[0].note).toBe('100 in red');

    cart.add(packAddition());
    expect(cart.lines()[0].note).toBe('100 in red');

    cart.add(packAddition({ note: '100 in blue' }));
    expect(cart.lines()[0].note).toBe('100 in blue');
  });

  it('stores a blank note as null, since the contract refuses an empty string', () => {
    const cart = service();
    cart.add(packAddition({ note: '   ' }));

    expect(cart.lines()[0].note).toBeNull();
    expect(cart.request()[0]).not.toHaveProperty('note');
  });

  // A line the shop cannot price exactly must not contribute a zero — the
  // subtotal has to be able to say it is incomplete.
  it('carries an unpriceable line as null rather than as nothing', () => {
    const cart = service();
    cart.add(pieceAddition({ pieces: 2 }));
    cart.add(
      packAddition({
        prices: {
          pieceMilliMinor: 1250,
          pieceLotMinor: null,
          pack: null,
          box: null,
        },
      }),
    );

    expect(cart.totalMinor()).toBe(2500);
    expect(cart.totalComplete()).toBe(false);
  });

  it('refuses an addition beyond the number of lines that may be priced', () => {
    const cart = service();
    for (let i = 0; i < 100; i++) {
      expect(cart.add(pieceAddition({ slug: `product-${i}` }))).toBe('added');
    }

    expect(cart.add(pieceAddition({ slug: 'one-too-many' }))).toBe('full');
    // A merge into an existing line is not one more line, so it still goes in.
    expect(cart.add(pieceAddition({ slug: 'product-0' }))).toBe('added');
    expect(cart.count()).toBe(100);
  });

  it('removes one line and clears the rest', () => {
    const cart = service();
    cart.add(pieceAddition());
    cart.add(packAddition());

    cart.remove('espresso-roast');
    expect(cart.count()).toBe(1);

    cart.clear();
    expect(cart.isEmpty()).toBe(true);
    expect(stored()?.lines).toEqual([]);
  });

  it('reads a stored cart back on the next visit', () => {
    const first = service();
    first.add(packAddition({ pieces: 12, note: 'two in green' }));

    TestBed.resetTestingModule();
    const next = service();

    expect(next.count()).toBe(1);
    expect(next.lines()[0].note).toBe('two in green');
    expect(next.totalMinor()).toBe(14000);
  });

  it('discards a cart written by an older version rather than half-reading it', () => {
    write({ version: 1, lines: [{ slug: 'x', unit: 'piece', quantity: 1 }] });

    expect(service().isEmpty()).toBe(true);
  });

  it('discards an unparseable cart', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');

    expect(service().isEmpty()).toBe(true);
  });

  // The payload is editable by hand, and a string quantity would otherwise
  // reach the contract as one.
  it('drops a stored line whose shape is wrong, keeping the rest', () => {
    write({
      version: 1,
      lines: [
        { ...pieceAddition(), pieces: '5', addedAt: '', name: 'x' },
        {
          slug: 'filter-roast',
          unit: 'pack',
          pieces: 12,
          note: null,
          name: 'Filter Roast',
          addedAt: '2026-08-01T00:00:00.000Z',
          unitPriceMinor: 7000,
          lineTotalMinor: 14000,
          prices: packAddition().prices,
          packaging: packAddition().packaging,
          image: null,
          boxVolume: '1.500',
          boxWeight: '9.000',
          boxCount: 1,
          noteEnabled: false,
          notePrompt: null,
        },
      ],
    });

    const cart = service();
    expect(cart.count()).toBe(1);
    expect(cart.lines()[0].slug).toBe('filter-roast');
  });

  // The three fields nothing on this page reads yet, and which a shape check
  // that skipped them would let through until something finally did: the
  // FR-CART-10 baseline, and the two figures every total is summed from.
  it('drops a stored line missing its baseline or carrying a figure as text', () => {
    const good = {
      slug: 'filter-roast',
      unit: 'pack',
      pieces: 12,
      note: null,
      name: 'Filter Roast',
      addedAt: '2026-08-01T00:00:00.000Z',
      unitPriceMinor: 7000,
      lineTotalMinor: 14000,
      prices: packAddition().prices,
      packaging: packAddition().packaging,
      image: null,
      boxVolume: '1.500',
      boxWeight: '9.000',
      boxCount: 1,
      noteEnabled: false,
      notePrompt: null,
    };

    write({
      version: 1,
      lines: [
        // No baseline to report against on the next visit.
        { ...good, slug: 'no-baseline', addedAt: undefined },
        // A total that would turn the sum into concatenation.
        { ...good, slug: 'text-total', lineTotalMinor: '14000' },
        { ...good, slug: 'text-unit-price', unitPriceMinor: '7000' },
        good,
      ],
    });

    const cart = service();
    expect(cart.lines().map((line) => line.slug)).toEqual(['filter-roast']);
    // And the surviving cart adds up as a number.
    expect(cart.totalMinor()).toBe(14000);
  });

  // Without this, a second tab writing the whole document makes the last
  // writer win in silence.
  it('re-reads the cart when another tab writes one', () => {
    const cart = service();
    cart.add(pieceAddition());

    write({
      version: 1,
      lines: [
        {
          slug: 'from-another-tab',
          unit: 'piece',
          pieces: 4,
          note: null,
          name: 'Another Tab',
          addedAt: '2026-08-01T00:00:00.000Z',
          unitPriceMinor: 100,
          lineTotalMinor: 400,
          prices: pieceAddition().prices,
          packaging: pieceAddition().packaging,
          image: null,
          boxVolume: null,
          boxWeight: null,
          boxCount: null,
          noteEnabled: false,
          notePrompt: null,
        },
      ],
    });
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0].slug).toBe('from-another-tab');
    expect(cart.totalMinor()).toBe(400);
  });

  it('keeps working, and says so, when the browser refuses to store the cart', () => {
    const cart = service();
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new DOMException('quota', 'QuotaExceededError');
      });

    cart.add(pieceAddition({ pieces: 2 }));

    expect(cart.count()).toBe(1);
    expect(cart.persistFailed()).toBe(true);
    setItem.mockRestore();
  });

  it('is empty on the server, where there is no storage to read', () => {
    write({
      version: 1,
      lines: [
        {
          slug: 'espresso-roast',
          unit: 'piece',
          pieces: 1,
          note: null,
          name: 'Espresso Roast',
          addedAt: '2026-08-01T00:00:00.000Z',
          unitPriceMinor: 1250,
          lineTotalMinor: 1250,
          prices: pieceAddition().prices,
          packaging: pieceAddition().packaging,
          image: null,
          boxVolume: null,
          boxWeight: null,
          boxCount: null,
          noteEnabled: false,
          notePrompt: null,
        },
      ],
    });

    const cart = service('server');
    expect(cart.isEmpty()).toBe(true);

    // And a write there stays in memory: nothing may reach a shared process.
    cart.add(pieceAddition());
    expect(cart.count()).toBe(1);
    expect(stored()?.lines).toHaveLength(1);
    expect(stored()?.lines[0].slug).toBe('espresso-roast');
  });

  describe('applyPreview', () => {
    function preview(
      lines: Partial<CartPreview['lines'][number]>[],
    ): CartPreview {
      return {
        lines: lines.map((line) => ({
          slug: 'filter-roast',
          unit: 'pack' as const,
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
            pieceMilliMinor: 1_166_667,
            pieceLotMinor: 7000,
            pack: 7000,
            box: 28_000,
          },
          lineTotalMinor: 7000,
          issues: [],
          ...line,
        })),
        totalMinor: 7000,
        complete: true,
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

    it('folds a corrected quantity, a dropped note and the new price back in', () => {
      const cart = service();
      cart.add(packAddition({ pieces: 6, note: 'in red' }));

      cart.applyPreview(
        preview([
          {
            pieces: 12,
            note: null,
            lineTotalMinor: 15000,
            prices: {
              pieceMilliMinor: 1_250_000,
              pieceLotMinor: 7500,
              pack: 7500,
              box: 30_000,
            },
            issues: ['quantity-corrected', 'note-not-allowed'],
          },
        ]),
      );

      const [line] = cart.lines();
      expect(line.pieces).toBe(12);
      expect(line.note).toBeNull();
      expect(line.unitPriceMinor).toBe(7500);
      expect(line.lineTotalMinor).toBe(15000);
    });

    // The server flags a dead line; taking it out is the customer's action.
    it('never removes a line, however unavailable it is', () => {
      const cart = service();
      cart.add(packAddition());

      cart.applyPreview(
        preview([
          {
            name: null,
            prices: null,
            packaging: null,
            lineTotalMinor: null,
            issues: ['unavailable'],
          },
        ]),
      );

      expect(cart.count()).toBe(1);
      // The stored name survives, because an unavailable line answers none.
      expect(cart.lines()[0].name).toBe('Filter Roast');
      expect(cart.lines()[0].lineTotalMinor).toBeNull();
      expect(cart.totalComplete()).toBe(false);
    });

    // The answer may carry another unit than the one that was sent, and it is
    // matched by slug for exactly that reason.
    it('takes the unit the answer fell back to', () => {
      const cart = service();
      cart.add(packAddition({ unit: 'box', pieces: 24 }));

      cart.applyPreview(
        preview([
          {
            unit: 'piece',
            pieces: 24,
            lineTotalMinor: 28_000,
            issues: ['unit-unavailable'],
          },
        ]),
      );

      expect(cart.lines()[0]).toMatchObject({ unit: 'piece', pieces: 24 });
      // Re-priced through the unit the answer came back in.
      expect(cart.lines()[0].unitPriceMinor).toBe(7000);
    });

    /**
     * FR-CART-10. The baseline is what the *previous* visit wrote down, so
     * every one of these prices a cart, forgets it, and reads it back — a
     * fresh service is a return visit.
     */
    describe('the change summary', () => {
      function returning(): CartService {
        TestBed.resetTestingModule();
        return service();
      }

      it('says what moved while the cart waited', () => {
        service().add(packAddition({ pieces: 6 }));

        const cart = returning();
        cart.applyPreview(preview([{ lineTotalMinor: 7500 }]));

        expect(cart.changes()).toEqual([
          {
            slug: 'filter-roast',
            name: 'Filter Roast',
            kind: 'price',
            fromMinor: 7000,
            toMinor: 7500,
          },
        ]);
      });

      it('says nothing where the shop still describes the cart the same way', () => {
        service().add(packAddition({ pieces: 6 }));

        const cart = returning();
        cart.applyPreview(preview([{}]));

        expect(cart.changes()).toEqual([]);
      });

      // One answer per line, most consequential first: a withdrawn product is
      // not also a price change.
      it('names a withdrawn line, a corrected quantity and a line it cannot price', () => {
        const first = service();
        first.add(packAddition({ slug: 'a', pieces: 6 }));
        first.add(packAddition({ slug: 'b', pieces: 6 }));
        first.add(packAddition({ slug: 'c', pieces: 6 }));

        const cart = returning();
        cart.applyPreview(
          preview([
            {
              slug: 'a',
              name: null,
              prices: null,
              packaging: null,
              lineTotalMinor: null,
              issues: ['unavailable'],
            },
            {
              slug: 'b',
              pieces: 12,
              lineTotalMinor: 14_000,
              issues: ['quantity-corrected'],
            },
            { slug: 'c', lineTotalMinor: null, issues: ['price-unavailable'] },
          ]),
        );

        expect(cart.changes().map((change) => change.kind)).toEqual([
          'unavailable',
          'quantity',
          'unpriced',
        ]);
      });

      // Shown once: every answer after the first one is the answer to an edit
      // the customer just made.
      it('reports the first pricing of a visit and no other', () => {
        service().add(packAddition({ pieces: 6 }));

        const cart = returning();
        cart.applyPreview(preview([{}]));
        cart.applyPreview(preview([{ lineTotalMinor: 9000 }]));

        expect(cart.changes()).toEqual([]);
      });

      it('puts the summary away when it is dismissed', () => {
        service().add(packAddition({ pieces: 6 }));

        const cart = returning();
        cart.applyPreview(preview([{ lineTotalMinor: 7500 }]));
        cart.dismissChanges();

        expect(cart.changes()).toEqual([]);
      });

      // Signing in or out moves every tiered price at once, and that is not
      // news about the cart.
      it('re-prices silently for a visitor the cart was not priced for', () => {
        service().add(packAddition({ pieces: 6 }));
        signIn('user');

        const cart = returning();
        cart.applyPreview(preview([{ lineTotalMinor: 7500 }]));

        expect(cart.changes()).toEqual([]);
        // And the new baseline says whose it is, so the visit after this one
        // is a return rather than a second re-baseline.
        expect(stored()?.pricedFor).toBe('user');
      });

      it('records who a cart was priced for as it is written', () => {
        signIn('manager');
        service().add(packAddition({ pieces: 6 }));

        expect(stored()?.pricedFor).toBe('manager');
      });
    });

    it('leaves a line the answer did not mention alone', () => {
      const cart = service();
      cart.add(packAddition({ pieces: 12 }));

      cart.applyPreview(preview([{ slug: 'something-else' }]));

      expect(cart.lines()[0].pieces).toBe(12);
      expect(cart.lines()[0].lineTotalMinor).toBe(14000);
    });
  });
});
