import {
  deliveryConfigSchema,
  normalizePostalCode,
  orderReferenceConfigSchema,
  resolveDeliveryZone,
} from './order-config';

const zones = deliveryConfigSchema.parse({
  zones: [
    {
      key: 'city',
      title: 'Within the city',
      freeFromMinor: 5000,
      match: { postalPrefixes: ['200', '201'] },
    },
    {
      key: 'region',
      title: 'The surrounding region',
      freeFromMinor: 25_000,
      match: { postalRanges: [{ from: '21000', to: '22999' }] },
    },
    { key: 'rest', title: 'Everywhere else', match: { all: true } },
  ],
}).zones;

describe('resolveDeliveryZone', () => {
  it('takes the first zone that matches, not the best one', () => {
    // 20095 matches the city prefix; the catch-all further down never runs.
    expect(resolveDeliveryZone(zones, { postalCode: '20095' })).toMatchObject({
      key: 'city',
      freeFromMinor: 5000,
    });
  });

  it('matches a range as fixed-width strings', () => {
    expect(resolveDeliveryZone(zones, { postalCode: '21079' })?.key).toBe(
      'region',
    );
    // Same digits, different width: 2107 is not inside 21000–22999.
    expect(resolveDeliveryZone(zones, { postalCode: '2107' })?.key).toBe(
      'rest',
    );
  });

  it('ignores spacing and case in a postal code', () => {
    expect(normalizePostalCode(' ab1 2cd ')).toBe('AB12CD');
    expect(resolveDeliveryZone(zones, { postalCode: '20 095' })?.key).toBe(
      'city',
    );
  });

  it('answers null where no zone covers the address', () => {
    const narrow = zones.filter((zone) => zone.key === 'city');
    expect(resolveDeliveryZone(narrow, { postalCode: '99999' })).toBeNull();
    expect(resolveDeliveryZone([], { postalCode: '20095' })).toBeNull();
  });
});

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
  it('accepts an upper-case prefix and a zone name', () => {
    expect(
      orderReferenceConfigSchema.parse({
        prefix: 'CK',
        timezone: 'Europe/Berlin',
      }),
    ).toEqual({ prefix: 'CK', timezone: 'Europe/Berlin' });
  });

  it('refuses a prefix with separators in it, which the format supplies', () => {
    expect(
      orderReferenceConfigSchema.safeParse({
        prefix: 'CK-',
        timezone: 'Europe/Berlin',
      }).success,
    ).toBe(false);
  });

  // The only use of the zone is on the way to a reference, so a typo left to
  // runtime is a shop that boots cleanly and then refuses every order.
  it('refuses a zone name the platform does not know, at config time', () => {
    expect(
      orderReferenceConfigSchema.safeParse({
        prefix: 'CK',
        timezone: 'Europe/Berlim',
      }).success,
    ).toBe(false);
  });

  it('accepts UTC and a fixed offset, which are zones too', () => {
    for (const timezone of ['UTC', 'Etc/GMT+3']) {
      expect(
        orderReferenceConfigSchema.safeParse({ prefix: 'CK', timezone })
          .success,
      ).toBe(true);
    }
  });
});
