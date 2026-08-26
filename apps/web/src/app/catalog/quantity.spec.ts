import { formatUnitQuantity, parseUnitQuantity } from './quantity';

const de = { code: 'EUR', locale: 'de-DE' };
const en = { code: 'USD', locale: 'en-US' };

describe('formatUnitQuantity', () => {
  it('writes a whole quantity without decimals', () => {
    expect(formatUnitQuantity(24, de)).toBe('24');
    expect(formatUnitQuantity(1, de)).toBe('1');
  });

  it('writes a part unit in the deployment’s own separator', () => {
    expect(formatUnitQuantity(0.2, de)).toBe('0,2');
    expect(formatUnitQuantity(0.2, en)).toBe('0.2');
  });

  it('trims to three decimals and drops trailing zeros', () => {
    expect(formatUnitQuantity(0.025, de)).toBe('0,025');
    // A field is what this fills, and "0,250" is only something to delete.
    expect(formatUnitQuantity(0.25, de)).toBe('0,25');
  });

  // A thousands separator inside an input is only something to delete, and it
  // would be re-read as a decimal point by the parser.
  it('never groups', () => {
    expect(formatUnitQuantity(12_000, de)).toBe('12000');
  });
});

describe('parseUnitQuantity', () => {
  // The locale decides how a figure is shown, never which key someone reaches
  // for — a German numeric pad has a comma, the row above the letters a dot.
  it('accepts either separator, whatever the locale', () => {
    expect(parseUnitQuantity('0,2')).toBe(0.2);
    expect(parseUnitQuantity('0.2')).toBe(0.2);
    expect(parseUnitQuantity(' 24 ')).toBe(24);
  });

  it('reads a half-typed figure as the whole number it has so far', () => {
    expect(parseUnitQuantity('2,')).toBe(2);
  });

  it('refuses anything that is not a quantity', () => {
    expect(parseUnitQuantity('')).toBeNull();
    expect(parseUnitQuantity('-1')).toBeNull();
    expect(parseUnitQuantity('1e3')).toBeNull();
    expect(parseUnitQuantity('two')).toBeNull();
  });
});
