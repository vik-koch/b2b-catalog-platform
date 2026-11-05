import {
  deliveryConfigSchema,
  orderReferenceConfigSchema,
} from './order-config';

describe('deliveryConfigSchema', () => {
  it('refuses a catch-all that is not last, since it hides the rest', () => {
    const result = deliveryConfigSchema.safeParse({
      zones: [
        { key: 'rest', title: 'Everywhere', match: { all: true } },
        { key: 'city', title: 'City', match: { postalPrefixes: ['200'] } },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('refuses a zone that matches on a city, since only the code is read', () => {
    const result = deliveryConfigSchema.safeParse({
      zones: [{ key: 'island', title: 'The island', match: { cities: ['X'] } }],
    });

    expect(result.success).toBe(false);
  });

  it('refuses a duplicate key, which an order would snapshot ambiguously', () => {
    const result = deliveryConfigSchema.safeParse({
      zones: [
        { key: 'city', title: 'A', match: { postalPrefixes: ['200'] } },
        { key: 'city', title: 'B', match: { postalPrefixes: ['201'] } },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('refuses a range whose ends are different widths or the wrong way round', () => {
    const range = (from: string, to: string) =>
      deliveryConfigSchema.safeParse({
        zones: [
          { key: 'z', title: 'Z', match: { postalRanges: [{ from, to }] } },
        ],
      }).success;

    expect(range('21000', '22999')).toBe(true);
    expect(range('1000', '22999')).toBe(false);
    expect(range('22999', '21000')).toBe(false);
  });

  it('refuses a zone that matches on nothing at all', () => {
    expect(
      deliveryConfigSchema.safeParse({
        zones: [{ key: 'z', title: 'Z', match: {} }],
      }).success,
    ).toBe(false);
  });
});

describe('orderReferenceConfigSchema', () => {
  it('accepts an upper-case prefix', () => {
    expect(orderReferenceConfigSchema.parse({ prefix: 'CK' })).toEqual({
      prefix: 'CK',
    });
  });

  it('accepts an upper-case prefix outside the Latin alphabet', () => {
    expect(orderReferenceConfigSchema.safeParse({ prefix: 'ÄÖ' }).success).toBe(
      true,
    );
  });

  it('refuses a prefix with separators in it, which the format supplies', () => {
    expect(
      orderReferenceConfigSchema.safeParse({ prefix: 'CK-' }).success,
    ).toBe(false);
  });
});
