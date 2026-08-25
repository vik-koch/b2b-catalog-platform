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
    quantity: 1,
    note: null,
    prices: { pieceLotMinor: 1250, pack: null, box: null },
    packaging: { ...plainPackaging },
    ...overrides,
  };
}

/** Six to a pack at €70 a pack, four packs to a box at €270. */
function packAddition(overrides: Partial<CartAddition> = {}): CartAddition {
  return {
    slug: 'filter-roast',
    name: 'Filter Roast',
    unit: 'pack',
    quantity: 1,
    note: null,
    prices: { pieceLotMinor: 7500, pack: 7000, box: 27000 },
    packaging: { ...packagedPackaging },
    ...overrides,
  };
}

function stored(): { version: number; lines: CartStoredLine[] } | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

function write(payload: unknown): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

describe('CartService', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty and stores what is added', () => {
    const cart = service();
    expect(cart.isEmpty()).toBe(true);

    expect(cart.add(pieceAddition({ quantity: 3 }))).toBe('added');

    expect(cart.count()).toBe(1);
    expect(cart.totalMinor()).toBe(3750);
    expect(cart.totalComplete()).toBe(true);
    expect(stored()?.lines[0].quantity).toBe(3);
  });

  it('records when a line was added and what it cost, from the first write', () => {
    const cart = service();
    cart.add(packAddition({ quantity: 2 }));

    const [line] = cart.lines();
    expect(line.addedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(line.unitPriceMinor).toBe(7000);
    expect(line.lineTotalMinor).toBe(14000);
  });

  // The identity rule: one product in one unit is one line, and the note
  // describes that line rather than splitting it.
  it('merges an addition of the same product and unit, re-pricing the sum', () => {
    const cart = service();
    cart.add(packAddition({ quantity: 2 }));
    cart.add(packAddition({ quantity: 3 }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0].quantity).toBe(5);
    expect(cart.lines()[0].lineTotalMinor).toBe(35000);
  });

  // A product is one line whatever unit it is held in: the same product as
  // pieces and as boxes on two rows is a cart a customer has to reconcile.
  it('moves the line to the new unit rather than opening a second one', () => {
    const cart = service();
    cart.add(packAddition({ unit: 'pack', quantity: 4 }));
    cart.add(packAddition({ unit: 'box', quantity: 1 }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0]).toMatchObject({ unit: 'box', quantity: 1 });
    expect(cart.totalMinor()).toBe(27000);
  });

  it('answers with the line a product is held in, whichever unit that is', () => {
    const cart = service();
    cart.add(packAddition({ unit: 'box', quantity: 1 }));

    expect(cart.lineFor('filter-roast')?.unit).toBe('box');
    expect(cart.lineFor('nothing-like-it')).toBeUndefined();
  });

  it('sets an existing line outright, re-pricing it, and creates nothing', () => {
    const cart = service();
    cart.add(packAddition({ unit: 'pack', quantity: 1 }));

    cart.setLine(packAddition({ unit: 'box', quantity: 2 }));
    cart.setLine(packAddition({ slug: 'not-in-the-cart', quantity: 3 }));

    expect(cart.count()).toBe(1);
    expect(cart.lines()[0]).toMatchObject({
      unit: 'box',
      quantity: 2,
      lineTotalMinor: 54000,
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
    cart.add(pieceAddition({ quantity: 2 }));
    cart.add(
      packAddition({
        prices: { pieceLotMinor: null, pack: null, box: null },
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

    cart.remove('espresso-roast', 'piece');
    expect(cart.count()).toBe(1);

    cart.clear();
    expect(cart.isEmpty()).toBe(true);
    expect(stored()?.lines).toEqual([]);
  });

  it('reads a stored cart back on the next visit', () => {
    const first = service();
    first.add(packAddition({ quantity: 2, note: 'two in green' }));

    TestBed.resetTestingModule();
    const next = service();

    expect(next.count()).toBe(1);
    expect(next.lines()[0].note).toBe('two in green');
    expect(next.totalMinor()).toBe(14000);
  });

  it('discards a cart written by an older version rather than half-reading it', () => {
    write({ version: 0, lines: [{ slug: 'x', unit: 'piece', quantity: 1 }] });

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
        { ...pieceAddition(), quantity: '5', addedAt: '', name: 'x' },
        {
          slug: 'filter-roast',
          unit: 'pack',
          quantity: 2,
          note: null,
          name: 'Filter Roast',
          addedAt: '2026-08-01T00:00:00.000Z',
          unitPriceMinor: 7000,
          lineTotalMinor: 14000,
        },
      ],
    });

    const cart = service();
    expect(cart.count()).toBe(1);
    expect(cart.lines()[0].slug).toBe('filter-roast');
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
          quantity: 4,
          note: null,
          name: 'Another Tab',
          addedAt: '2026-08-01T00:00:00.000Z',
          unitPriceMinor: 100,
          lineTotalMinor: 400,
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

    cart.add(pieceAddition({ quantity: 2 }));

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
          quantity: 1,
          note: null,
          name: 'Espresso Roast',
          addedAt: '2026-08-01T00:00:00.000Z',
          unitPriceMinor: 1250,
          lineTotalMinor: 1250,
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
          quantity: 1,
          note: null,
          name: 'Filter Roast',
          image: null,
          packaging: { ...packagedPackaging },
          prices: {
            pieceMilliMinor: 1250,
            pieceLotMinor: 7500,
            pack: 7000,
            box: 27000,
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
      cart.add(packAddition({ quantity: 1, note: 'in red' }));

      cart.applyPreview(
        preview([
          {
            quantity: 2,
            note: null,
            lineTotalMinor: 15000,
            prices: {
              pieceMilliMinor: 1250,
              pieceLotMinor: 7500,
              pack: 7500,
              box: 29000,
            },
            issues: ['quantity-corrected', 'note-not-allowed'],
          },
        ]),
      );

      const [line] = cart.lines();
      expect(line.quantity).toBe(2);
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

    it('leaves a line the answer did not mention alone', () => {
      const cart = service();
      cart.add(packAddition({ quantity: 2 }));

      cart.applyPreview(preview([{ slug: 'something-else' }]));

      expect(cart.lines()[0].quantity).toBe(2);
      expect(cart.lines()[0].lineTotalMinor).toBe(14000);
    });
  });
});
