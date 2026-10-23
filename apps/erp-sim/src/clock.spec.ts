import { localDate, nightsBetween } from './clock';

describe('the shop calendar', () => {
  it('dates an instant in the shop time zone, not UTC', () => {
    // 23:30 UTC on 2 July is already 3 July in Dublin (UTC+1 in summer).
    const instant = new Date('2026-07-02T23:30:00Z');
    expect(localDate(instant, 'UTC')).toBe('2026-07-02');
    expect(localDate(instant, 'Europe/Dublin')).toBe('2026-07-03');
  });

  it('counts the shop midnights since the reset', () => {
    const reset = new Date('2026-10-19T14:00:00Z');
    const at = (iso: string) =>
      nightsBetween(reset, new Date(iso), 'Europe/Dublin');
    expect(at('2026-10-19T22:59:00Z')).toBe(0);
    // Dublin is UTC+1 until 25 October: its midnight is 23:00 UTC.
    expect(at('2026-10-19T23:00:00Z')).toBe(1);
    expect(at('2026-10-25T12:00:00Z')).toBe(6);
  });

  it('counts a day with a clock change as one day', () => {
    const reset = new Date('2026-10-24T12:00:00Z');
    // Dublin goes back an hour early on 25 October.
    expect(
      nightsBetween(reset, new Date('2026-10-26T00:30:00Z'), 'Europe/Dublin'),
    ).toBe(2);
  });
});
