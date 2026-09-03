import { cartRequestSchema } from './cart.contract';
import { CART_LINES_MAX, CART_NOTE_MAX } from './cart-constants';
import { LINE_PIECES_MAX } from './product-units';

const line = (overrides: Record<string, unknown> = {}) => ({
  slug: 'hafen-espresso',
  unit: 'pack',
  pieces: 12,
  ...overrides,
});

const accepts = (lines: unknown[]) =>
  cartRequestSchema.safeParse({ lines }).success;

/**
 * The cart is browser-held, so this schema is the whole of what the API is
 * willing to be told about it — and `/cart/preview` is unauthenticated, which
 * makes every bound here a limit on what a stranger can ask the server to do.
 */
describe('cartRequestSchema', () => {
  it('accepts an ordinary line', () => {
    expect(accepts([line()])).toBe(true);
  });

  it('accepts an empty cart, which is a normal thing to price', () => {
    expect(accepts([])).toBe(true);
  });

  /**
   * The quantity is always an integer count of pieces, whatever unit it is
   * read in (ADR 0042): 0.2 bx is two packs, and two packs of six is twelve.
   * Nothing fractional ever reaches the wire.
   */
  it('takes pieces as a positive whole number and nothing else', () => {
    expect(accepts([line({ pieces: 0.5 })])).toBe(false);
    expect(accepts([line({ pieces: 0 })])).toBe(false);
    expect(accepts([line({ pieces: -12 })])).toBe(false);
    expect(accepts([line({ pieces: '12' })])).toBe(false);
  });

  // An unauthenticated N-product lookup: the ceilings are what stop one
  // request from becoming a catalog-wide scan.
  describe('the bounds a stranger cannot argue with', () => {
    it('caps the pieces on one line', () => {
      expect(accepts([line({ pieces: LINE_PIECES_MAX })])).toBe(true);
      expect(accepts([line({ pieces: LINE_PIECES_MAX + 1 })])).toBe(false);
    });

    it('caps how many lines one cart may ask about', () => {
      const many = (n: number) =>
        Array.from({ length: n }, (_, i) => line({ slug: `product-${i}` }));

      expect(accepts(many(CART_LINES_MAX))).toBe(true);
      expect(accepts(many(CART_LINES_MAX + 1))).toBe(false);
    });

    it('caps a line note, which is free text a stranger writes', () => {
      expect(accepts([line({ note: 'x'.repeat(CART_NOTE_MAX) })])).toBe(true);
      expect(accepts([line({ note: 'x'.repeat(CART_NOTE_MAX + 1) })])).toBe(
        false,
      );
    });

    it('caps a slug rather than taking a paragraph as one', () => {
      expect(accepts([line({ slug: 'x'.repeat(256) })])).toBe(false);
    });
  });

  // Absent, null and written are three states; blank and whitespace are not a
  // fourth — a note that says nothing is not a note.
  it('takes a note as absent, null or actually written', () => {
    expect(accepts([line({ note: undefined })])).toBe(true);
    expect(accepts([line({ note: null })])).toBe(true);
    expect(accepts([line({ note: 'Sand only' })])).toBe(true);
    expect(accepts([line({ note: '' })])).toBe(false);
    expect(accepts([line({ note: '   ' })])).toBe(false);
  });

  it('takes only a unit the catalog actually sells in', () => {
    expect(accepts([line({ unit: 'piece' })])).toBe(true);
    expect(accepts([line({ unit: 'box' })])).toBe(true);
    expect(accepts([line({ unit: 'pallet' })])).toBe(false);
  });

  // NFR-SEC-05: unknown keys are rejected rather than stripped, so a browser
  // cannot smuggle a price alongside the quantity.
  it('refuses a key it does not know', () => {
    expect(accepts([line({ lineTotalMinor: 1 })])).toBe(false);
    expect(
      cartRequestSchema.safeParse({ lines: [], tier: 'wholesale' }).success,
    ).toBe(false);
  });
});
