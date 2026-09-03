import {
  normalizePostalCode,
  postalCodeMatches,
  postalCodeRuleFor,
} from './postal-code';

const germany = {
  code: 'DE',
  label: 'Germany',
  postalCode: { pattern: '^[0-9]{5}$', example: '20457', mask: '#####' },
};

describe('the postal code rule', () => {
  it('belongs to a country, and is absent where none was configured', () => {
    const countries = [germany, { code: 'AT', label: 'Austria' }];

    expect(postalCodeRuleFor('DE', countries)?.example).toBe('20457');
    expect(postalCodeRuleFor('AT', countries)).toBeUndefined();
    expect(postalCodeRuleFor('FR', countries)).toBeUndefined();
    expect(postalCodeRuleFor('DE', undefined)).toBeUndefined();
  });

  it('holds a code to the shape its own country asks for', () => {
    expect(postalCodeMatches('20457', germany.postalCode)).toBe(true);
    expect(postalCodeMatches('2045', germany.postalCode)).toBe(false);
    expect(postalCodeMatches('204577', germany.postalCode)).toBe(false);
    expect(postalCodeMatches('2045X', germany.postalCode)).toBe(false);
  });

  // A code is typed the way it is printed, so refusing one over a space or
  // over its case would be refusing the code.
  it('normalizes before it compares', () => {
    const uk = {
      pattern: '^[A-Z]{2}[0-9]{1,2}[0-9][A-Z]{2}$',
      example: 'AB12CD',
    };

    expect(postalCodeMatches('ab1 2cd', uk)).toBe(true);
  });

  /** No rule is no shape to be in — the contract still asks for a value. */
  it('accepts anything where the country has no rule', () => {
    expect(postalCodeMatches('anything', undefined)).toBe(true);
  });

  it('ignores spacing and case in a postal code', () => {
    expect(normalizePostalCode(' ab1 2cd ')).toBe('AB12CD');
  });
});
