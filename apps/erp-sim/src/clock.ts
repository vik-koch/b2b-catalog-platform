/**
 * The shop's calendar. A back office works in the shop's own time zone, so
 * "nightly" means the shop's midnight, not the server's.
 */

/** The calendar date `instant` falls on in `timeZone`, as YYYY-MM-DD. */
export function localDate(instant: Date, timeZone: string): string {
  // en-CA writes dates the ISO way round.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}

/**
 * How many of the shop's midnights lie between `from` and `to`: 0 on the day
 * of the reset, 1 from the first midnight after it. Counted on the calendar,
 * so a day with a clock change is still one day.
 */
export function nightsBetween(from: Date, to: Date, timeZone: string): number {
  const day = (instant: Date) =>
    Date.parse(`${localDate(instant, timeZone)}T00:00:00Z`);
  return Math.round((day(to) - day(from)) / 86_400_000);
}
