import {
  currencyFractionDigits,
  formatPriceMinor,
  majorToMinor,
  minorToMajor,
} from './price';

/** de-DE inserts a non-breaking space before the symbol; normalise for asserts. */
const norm = (s: string): string => s.replace(/\u00A0/g, ' ');

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

describe('minor/major conversion (product editor input)', () => {
  const eur = { code: 'EUR', locale: 'de-DE' };
  const jpy = { code: 'JPY', locale: 'ja-JP' };
  const bhd = { code: 'BHD', locale: 'en-US' };

  it('reports the currency fraction digits', () => {
    expect(currencyFractionDigits(eur)).toBe(2);
    expect(currencyFractionDigits(jpy)).toBe(0);
    expect(currencyFractionDigits(bhd)).toBe(3);
  });

  it('converts minor units to a major-unit number', () => {
    expect(minorToMajor(1890, eur)).toBe(18.9);
    expect(minorToMajor(500, jpy)).toBe(500); // zero-decimal
  });

  it('converts a major-unit input to integer minor units, rounding', () => {
    expect(majorToMinor(18.9, eur)).toBe(1890);
    expect(majorToMinor(18.905, eur)).toBe(1891); // rounds half up
    expect(majorToMinor(500, jpy)).toBe(500);
    expect(majorToMinor(1.234, bhd)).toBe(1234); // three-decimal
  });

  it('round-trips a stored price through the editor input', () => {
    for (const minor of [0, 1, 99, 1890, 189000]) {
      expect(majorToMinor(minorToMajor(minor, eur), eur)).toBe(minor);
    }
  });
});
