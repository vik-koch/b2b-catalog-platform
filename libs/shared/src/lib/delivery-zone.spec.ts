import { resolveDeliveryZone } from './delivery-zone';

/** Written out rather than parsed: matching a zone reads the rows
 * structurally, so this module has no need of the schema that shapes them. */
const zones = [
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
  { key: 'rest', title: 'Everywhere else', match: { all: true as const } },
];

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

  it('answers null where no zone covers the address', () => {
    const narrow = zones.filter((zone) => zone.key === 'city');
    expect(resolveDeliveryZone(narrow, { postalCode: '99999' })).toBeNull();
    expect(resolveDeliveryZone([], { postalCode: '20095' })).toBeNull();
  });

  // A code is typed the way it is printed, so a zone must be found through the
  // spacing as readily as without it.
  it('matches through the spacing in a postal code', () => {
    expect(resolveDeliveryZone(zones, { postalCode: '20 095' })?.key).toBe(
      'city',
    );
  });
});
