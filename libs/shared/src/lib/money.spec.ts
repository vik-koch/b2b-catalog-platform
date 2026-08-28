import {
  currencyFractionDigits,
  decimalSeparator,
  formatMoneyMinor,
  MoneyFormat,
} from './money';

const eur: MoneyFormat = { code: 'EUR', locale: 'de-DE' };

/**
 * The one implementation both a page and the mail it links to format through.
 * Two of them is how the two come to disagree, so what is pinned here is the
 * arithmetic — above all the divisor, which is read off the currency rather
 * than assumed to be a hundred.
 */
describe('formatMoneyMinor', () => {
  it('reads the divisor off the currency, not off a constant', () => {
    // 1890 minor units is €18.90, ¥1890, and BD1.890 — same integer, three
    // different amounts, because the exponent differs.
    expect(formatMoneyMinor(1890, eur)).toContain('18,90');
    expect(formatMoneyMinor(1890, { code: 'JPY', locale: 'ja-JP' })).toContain(
      '1,890',
    );
    expect(formatMoneyMinor(1890, { code: 'BHD', locale: 'en-BH' })).toContain(
      '1.890',
    );
  });

  it('writes the currency, in the locale’s own order', () => {
    expect(formatMoneyMinor(1890, eur)).toBe('18,90 €');
    expect(formatMoneyMinor(1890, { code: 'EUR', locale: 'en-IE' })).toBe(
      '€18.90',
    );
  });

  it('keeps zero and negatives intact', () => {
    expect(formatMoneyMinor(0, eur)).toBe('0,00 €');
    expect(formatMoneyMinor(-1890, eur)).toContain('18,90');
    expect(formatMoneyMinor(-1890, eur)).toContain('-');
  });

  it('does not lose precision on a large total', () => {
    // A box order runs to thousands; nothing here may round to the euro.
    expect(formatMoneyMinor(123_456_789, eur)).toBe('1.234.567,89 €');
  });

  it('falls back to the runtime locale where a deployment set none', () => {
    // Not asserted against a fixed string — the runtime's locale is whatever
    // the host has. What matters is that it formats rather than throwing.
    expect(formatMoneyMinor(1890, { code: 'EUR' })).toContain('18');
  });
});

describe('currencyFractionDigits', () => {
  it('answers the currency’s own exponent', () => {
    expect(currencyFractionDigits(eur)).toBe(2);
    expect(currencyFractionDigits({ code: 'JPY', locale: 'ja-JP' })).toBe(0);
    expect(currencyFractionDigits({ code: 'BHD', locale: 'en-BH' })).toBe(3);
  });
});

describe('decimalSeparator', () => {
  it('answers what the locale writes amounts with', () => {
    expect(decimalSeparator(eur)).toBe(',');
    expect(decimalSeparator({ code: 'EUR', locale: 'en-IE' })).toBe('.');
  });
});
