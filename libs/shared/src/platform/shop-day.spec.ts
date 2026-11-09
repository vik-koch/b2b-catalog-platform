import { calendarDay, shopDay } from './shop-day';

describe('shopDay', () => {
  it('names the day it is in the shop, not where the code runs', () => {
    // Already the 10th in Auckland; still the 9th in Europe and in UTC.
    expect(shopDay('2026-11-09T12:00:00Z', 'en-GB', 'Pacific/Auckland')).toBe(
      '10 November 2026',
    );
  });
});

describe('calendarDay', () => {
  it('writes the day it names, whatever the zone', () => {
    expect(calendarDay('2026-11-10', 'en-GB')).toBe('10 November 2026');
  });
});
