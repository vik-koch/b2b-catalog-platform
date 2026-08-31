import { firstOrderDate, isOrderDateAllowed } from './order-dates';

/**
 * 2026-08-26 is a Wednesday, so the week around it reads: Fri 28, Sat 29,
 * Sun 30, Mon 31. Fixed dates rather than offsets from today — a rule about
 * weekends tested against "tomorrow" passes on four days in seven.
 */
describe('firstOrderDate', () => {
  it('is the next day on an ordinary weekday', () => {
    expect(firstOrderDate('2026-08-26')).toBe('2026-08-27');
  });

  // Friday's next day is Saturday, and the one after that is Sunday.
  it('skips the weekend from a Friday', () => {
    expect(firstOrderDate('2026-08-28')).toBe('2026-08-31');
  });

  it('skips the rest of the weekend from a Saturday', () => {
    expect(firstOrderDate('2026-08-29')).toBe('2026-08-31');
  });
});

describe('isOrderDateAllowed', () => {
  const today = '2026-08-26';

  it('takes a weekday from tomorrow onwards', () => {
    expect(isOrderDateAllowed('2026-08-27', today)).toBe(true);
    expect(isOrderDateAllowed('2026-09-04', today)).toBe(true);
  });

  // Today is not a wish anybody can act on: an order placed this morning is
  // picked and packed rather than handed over.
  it('refuses today and anything before it', () => {
    expect(isOrderDateAllowed(today, today)).toBe(false);
    expect(isOrderDateAllowed('2026-08-25', today)).toBe(false);
  });

  it('refuses a weekend however far ahead it is', () => {
    expect(isOrderDateAllowed('2026-08-29', today)).toBe(false);
    expect(isOrderDateAllowed('2026-09-06', today)).toBe(false);
  });

  it('refuses anything that is not a date', () => {
    expect(isOrderDateAllowed('', today)).toBe(false);
    expect(isOrderDateAllowed('2026-08', today)).toBe(false);
    expect(isOrderDateAllowed('2026-02-31', today)).toBe(false);
  });
});
