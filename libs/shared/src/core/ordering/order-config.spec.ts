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
  const valid = (format: string) =>
    orderReferenceConfigSchema.safeParse({ format }).success;

  it.each([
    'CK{date}-####',
    '{date}-CK-####',
    '{date}-#####',
    'ÄÖ.{date}_####',
  ])(
    'takes a format with its date and random digits anywhere: %s',
    (format) => {
      expect(valid(format)).toBe(true);
    },
  );

  it('needs the date exactly once', () => {
    expect(valid('CK-####')).toBe(false);
    expect(valid('{date}{date}-####')).toBe(false);
  });

  it('needs four random digits, or a busy day runs out of references', () => {
    expect(valid('CK{date}-###')).toBe(false);
    expect(valid('CK{date}-#-#-#-#')).toBe(true);
  });

  // A reference is part of an order's URL.
  it('refuses a character a URL or a phone call would trip over', () => {
    expect(valid('CK/{date}/####')).toBe(false);
    expect(valid('ck{date}-####')).toBe(false);
    expect(valid('CK {date}-####')).toBe(false);
    expect(valid('CK{day}-####{date}')).toBe(false);
  });

  it('fits the stored column once the date is filled in', () => {
    expect(valid(`${'A'.repeat(22)}{date}####`)).toBe(true);
    expect(valid(`${'A'.repeat(23)}{date}####`)).toBe(false);
  });
});
