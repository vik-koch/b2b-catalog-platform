import {
  currencyFractionDigits,
  isPartialPrice,
  decimalSeparator,
  formatPriceInput,
  formatPriceMinor,
  majorToMinor,
  minorToMajor,
  parsePriceInput,
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

const EUR_DE = { code: 'EUR', locale: 'de-DE' };
const EUR_US = { code: 'EUR', locale: 'en-US' };
const JPY = { code: 'JPY', locale: 'ja-JP' };

describe('parsePriceInput', () => {
  it('accepts both separators regardless of locale', () => {
    // The locale decides how a price is shown, not which key someone presses.
    expect(parsePriceInput('18,90', EUR_DE)).toBe(1890);
    expect(parsePriceInput('18.90', EUR_DE)).toBe(1890);
    expect(parsePriceInput('18,90', EUR_US)).toBe(1890);
    expect(parsePriceInput('18.90', EUR_US)).toBe(1890);
  });

  it('treats a half-typed value as the whole number it already is', () => {
    // The keystroke that used to wipe the field.
    expect(parsePriceInput('18,', EUR_DE)).toBe(1800);
    expect(parsePriceInput('18.', EUR_DE)).toBe(1800);
  });

  it('rounds to the currency’s precision', () => {
    expect(parsePriceInput('18,905', EUR_DE)).toBe(1891);
    // Zero-decimal currency: the minor unit is the whole yen.
    expect(parsePriceInput('500', JPY)).toBe(500);
  });

  it('reads an empty field as no price, not as zero', () => {
    expect(parsePriceInput('', EUR_DE)).toBeNull();
    expect(parsePriceInput('   ', EUR_DE)).toBeNull();
    // A real zero is still a price.
    expect(parsePriceInput('0', EUR_DE)).toBe(0);
  });

  it('rejects anything that is not a plain decimal', () => {
    // `Number()` alone would take every one of these.
    for (const input of ['1e3', '0x10', '-5', '1 2', '12,34,56', 'abc', '.']) {
      expect(parsePriceInput(input, EUR_DE)).toBeNull();
    }
  });
});

describe('formatPriceInput', () => {
  it('uses the locale’s separator and the full precision', () => {
    expect(formatPriceInput(1890, EUR_DE)).toBe('18,90');
    expect(formatPriceInput(1890, EUR_US)).toBe('18.90');
    // Trailing zeros kept: a price field shows 18,90, not 18,9.
    expect(formatPriceInput(1800, EUR_DE)).toBe('18,00');
  });

  it('carries no symbol or grouping — it is a value, not a label', () => {
    expect(formatPriceInput(123456789, EUR_DE)).toBe('1234567,89');
  });

  it('writes a zero-decimal currency without a separator', () => {
    expect(formatPriceInput(500, JPY)).toBe('500');
  });

  it('round-trips through the parser', () => {
    expect(parsePriceInput(formatPriceInput(1890, EUR_DE), EUR_DE)).toBe(1890);
  });
});

describe('decimalSeparator', () => {
  it('reports what the locale writes', () => {
    expect(decimalSeparator(EUR_DE)).toBe(',');
    expect(decimalSeparator(EUR_US)).toBe('.');
  });
});

describe('isPartialPrice', () => {
  it('allows a price that is still being typed', () => {
    for (const text of ['', '1', '18', '18,', '18.', '18,9', '18,90']) {
      expect(isPartialPrice(text, EUR_DE)).toBe(true);
    }
  });

  it('refuses what a price can never contain', () => {
    // The keystroke is refused rather than typed and complained about later.
    for (const text of ['a', '18a', '-1', '1 8', '18,,9', '1.2.3', '€18']) {
      expect(isPartialPrice(text, EUR_DE)).toBe(false);
    }
  });

  it('holds the currency to its own precision', () => {
    expect(isPartialPrice('18,90', EUR_DE)).toBe(true);
    // Three decimals in a two-decimal currency is not a rounding question, it
    // is a typo.
    expect(isPartialPrice('18,901', EUR_DE)).toBe(false);
    expect(isPartialPrice('18,901', { code: 'BHD', locale: 'en-US' })).toBe(
      true,
    );
  });

  it('refuses a separator outright in a zero-decimal currency', () => {
    expect(isPartialPrice('500', JPY)).toBe(true);
    expect(isPartialPrice('500,', JPY)).toBe(false);
  });
});
