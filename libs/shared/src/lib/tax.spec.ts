import {
  effectiveTaxRate,
  isPartialTaxRate,
  parseTaxRate,
  sharedTaxRate,
} from './tax';

describe('parseTaxRate', () => {
  it('reads either decimal mark, and empty as the default', () => {
    expect(parseTaxRate('7')).toBe(7);
    expect(parseTaxRate('5,5')).toBe(5.5);
    expect(parseTaxRate(' 12.75 ')).toBe(12.75);
    expect(parseTaxRate('')).toBeNull();
  });

  it('is not a rate past two decimals, past 100, or with anything else in it', () => {
    for (const text of ['5.555', '101', '19 %', '-1', '1e2', '.5']) {
      expect(parseTaxRate(text)).toBeUndefined();
    }
  });
});

describe('isPartialTaxRate', () => {
  it('lets every prefix of a rate through as it is typed', () => {
    for (const text of ['', '1', '12', '12,', '12,7', '12.75', '100', '0']) {
      expect(isPartialTaxRate(text)).toBe(true);
    }
  });

  it('refuses the keystroke that would make it no rate at all', () => {
    for (const text of ['12.755', '101', '1000', '12a', '-', '12,5,']) {
      expect(isPartialTaxRate(text)).toBe(false);
    }
  });
});

describe('effectiveTaxRate', () => {
  const charging = { basis: 'included' as const, rate: 19 };

  it('takes the product’s own rate over the default', () => {
    expect(effectiveTaxRate(charging, 7)).toBe(7);
    expect(effectiveTaxRate(charging, null)).toBe(19);
  });

  it('is no rate at all where no tax is charged, whatever the product keeps', () => {
    expect(effectiveTaxRate({ basis: 'none' }, 7)).toBeNull();
  });
});

describe('sharedTaxRate', () => {
  it('names the rate every line shares', () => {
    expect(sharedTaxRate([7, 7])).toBe(7);
  });

  it('names none once two lines differ', () => {
    expect(sharedTaxRate([7, 19, 7])).toBeNull();
  });

  it('has nothing to say about no lines', () => {
    expect(sharedTaxRate([])).toBeUndefined();
  });
});
