import { formatPriceMinor } from './price';

/** de-DE inserts a non-breaking space before the symbol; normalise for asserts. */
const norm = (s: string): string => s.replace(/ /g, ' ');

describe('formatPriceMinor', () => {
  it('formats EUR minor units in de-DE (symbol after, comma decimal)', () => {
    expect(norm(formatPriceMinor(1890, { code: 'EUR', locale: 'de-DE' }))).toBe(
      '18,90 €',
    );
  });

  it('formats the same amount differently per locale', () => {
    expect(formatPriceMinor(1890, { code: 'EUR', locale: 'en-US' })).toBe(
      '€18.90',
    );
  });

  it('renders whole amounts with the currency fraction digits', () => {
    expect(
      norm(formatPriceMinor(189000, { code: 'EUR', locale: 'de-DE' })),
    ).toBe('1.890,00 €');
  });

  it('derives the divisor from the currency: zero-decimal (JPY)', () => {
    // 500 minor units of a zero-decimal currency is 500, not 5.
    expect(norm(formatPriceMinor(500, { code: 'JPY', locale: 'ja-JP' }))).toBe(
      '￥500',
    );
  });

  it('derives the divisor from the currency: three-decimal (BHD)', () => {
    expect(formatPriceMinor(1234, { code: 'BHD', locale: 'en-US' })).toContain(
      '1.234',
    );
  });

  it('formats zero', () => {
    expect(norm(formatPriceMinor(0, { code: 'EUR', locale: 'de-DE' }))).toBe(
      '0,00 €',
    );
  });
});
