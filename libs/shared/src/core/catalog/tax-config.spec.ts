import { formatTaxRate } from './tax';
import { taxConfigSchema } from './tax-config';

describe('taxConfigSchema', () => {
  it('takes a charging basis with its default rate', () => {
    for (const rate of [19, 7, 5.5, 0, 12.75]) {
      const result = taxConfigSchema.safeParse({
        basis: 'included',
        rate,
        statedAtPrices: true,
      });
      expect(result.success).toBe(true);
    }
  });

  it('refuses a charging basis without a rate, which would leave a hole in the sentence', () => {
    const result = taxConfigSchema.safeParse({
      basis: 'added',
      statedAtPrices: false,
    });

    expect(result.success).toBe(false);
  });

  it('refuses a rate under `none`, which charges nothing to name', () => {
    const result = taxConfigSchema.safeParse({ basis: 'none', rate: 19 });

    expect(result.success).toBe(false);
  });

  it('refuses a rate past two decimals or outside 0–100', () => {
    for (const rate of [5.555, -1, 101]) {
      const result = taxConfigSchema.safeParse({
        basis: 'included',
        rate,
        statedAtPrices: true,
      });
      expect(result.success).toBe(false);
    }
  });
});

describe('formatTaxRate', () => {
  it('writes the rate as the locale writes numbers, without trailing zeros', () => {
    expect(formatTaxRate(5.5, 'de-DE')).toBe('5,5');
    expect(formatTaxRate(19, 'de-DE')).toBe('19');
    expect(formatTaxRate(12.75, 'en-GB')).toBe('12.75');
  });
});
