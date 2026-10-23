import { workingHour } from './schedule';

const hours = { days: [1, 2, 3, 4, 5], from: 8, to: 16 };
const at = (iso: string) => workingHour(new Date(iso), 'Europe/Dublin', hours);

describe('workingHour', () => {
  it('names the working hour on the shop clock', () => {
    // Friday 23 October 2026, 09:20 in Dublin (UTC+1).
    expect(at('2026-10-23T08:20:00Z')).toBe('2026-10-23 09');
  });

  it('includes the first and the last hour a cycle starts in', () => {
    expect(at('2026-10-23T07:00:00Z')).toBe('2026-10-23 08');
    expect(at('2026-10-23T15:59:00Z')).toBe('2026-10-23 16');
    expect(at('2026-10-23T16:00:00Z')).toBeNull();
    expect(at('2026-10-23T06:59:00Z')).toBeNull();
  });

  it('is closed at the weekend', () => {
    // Saturday 24 October, 11:00 in Dublin.
    expect(at('2026-10-24T10:00:00Z')).toBeNull();
  });
});
