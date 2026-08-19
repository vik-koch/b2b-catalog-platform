import {
  ATTRIBUTE_NUMERIC_LIMIT,
  parseAttributeNumber,
} from './attribute-value';

describe('parseAttributeNumber', () => {
  it('reads plain integers and decimals, signed or not', () => {
    expect(parseAttributeNumber('30')).toBe(30);
    expect(parseAttributeNumber('30.5')).toBe(30.5);
    expect(parseAttributeNumber('.5')).toBe(0.5);
    expect(parseAttributeNumber('-2')).toBe(-2);
    expect(parseAttributeNumber('+2')).toBe(2);
    expect(parseAttributeNumber('0')).toBe(0);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseAttributeNumber('  30  ')).toBe(30);
  });

  it('refuses a value carrying its unit — the unit is the definition’s', () => {
    expect(parseAttributeNumber('30 cm')).toBeNull();
    expect(parseAttributeNumber('30cm')).toBeNull();
  });

  it('refuses what only looks numeric', () => {
    expect(parseAttributeNumber('ca. 30')).toBeNull();
    expect(parseAttributeNumber('1,5')).toBeNull();
    expect(parseAttributeNumber('1e3')).toBeNull();
    expect(parseAttributeNumber('30-40')).toBeNull();
    expect(parseAttributeNumber('')).toBeNull();
    expect(parseAttributeNumber('  ')).toBeNull();
  });

  it('refuses what the numeric column could not hold', () => {
    expect(parseAttributeNumber(String(ATTRIBUTE_NUMERIC_LIMIT))).toBeNull();
    expect(parseAttributeNumber('-999999999999999')).toBeNull();
    expect(parseAttributeNumber('999999999.999999')).toBe(999999999.999999);
  });
});
