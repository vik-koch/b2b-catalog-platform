import { fillText } from './fill-text';

/**
 * Filling app text, and the singular the shop kept saying wrong: one result
 * used to be announced as "1 products found".
 */
describe('fillText', () => {
  it('substitutes every occurrence of a placeholder', () => {
    // The minimum is also the step, so `{qty}` appears twice in one sentence.
    expect(
      fillText('minimum {qty} {unit}, in steps of {qty}', {
        qty: 10,
        unit: 'pcs',
      }),
    ).toBe('minimum 10 pcs, in steps of 10');
  });

  it('leaves a text without a second form alone', () => {
    expect(fillText('{count} awaiting your attention', { count: 1 })).toBe(
      '1 awaiting your attention',
    );
  });

  describe('a text that carries both forms', () => {
    const found = '{count} product found|{count} products found';

    it('takes the singular for exactly one', () => {
      expect(fillText(found, { count: 1 })).toBe('1 product found');
    });

    it('takes the plural for anything else', () => {
      expect(fillText(found, { count: 0 })).toBe('0 products found');
      expect(fillText(found, { count: 2 })).toBe('2 products found');
    });

    // The forms can differ by more than an `s`, which is the point of writing
    // both out rather than appending one.
    it('takes the whole sentence, not just the noun', () => {
      const missing =
        '{count} product in your cart is missing what it is sold with.|{count} products in your cart are missing what they are sold with.';

      expect(fillText(missing, { count: 1 })).toBe(
        '1 product in your cart is missing what it is sold with.',
      );
      expect(fillText(missing, { count: 3 })).toBe(
        '3 products in your cart are missing what they are sold with.',
      );
    });

    it('keeps the other placeholders in the form it picked', () => {
      const cart = 'Cart: {count} line, {total}|Cart: {count} lines, {total}';

      expect(fillText(cart, { count: 1, total: '€9.99' })).toBe(
        'Cart: 1 line, €9.99',
      );
    });

    /**
     * A text with no count to choose by is left as written rather than
     * silently losing half of itself at the `|`.
     */
    it('takes the plural when nothing counts', () => {
      expect(fillText('one|many', {})).toBe('many');
    });
  });
});
