/** The shop's time zone; a deployment that names none keeps UTC. */
export function shopTimeZone(config: { readonly timeZone?: string }): string {
  return config.timeZone ?? 'UTC';
}

/** A moment as the shop's own day, in its time zone: the same day on a page,
 * in a mail and in a PDF. */
export function shopDay(
  iso: string,
  locale: string | undefined,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone,
  }).format(new Date(iso));
}

/** Today in the shop, as YYYY-MM-DD: what "tomorrow" is counted from,
 * wherever the code runs. */
export function shopToday(timeZone: string, now: Date = new Date()): string {
  return shopIsoDay(now.toISOString(), timeZone);
}

/** The same day as YYYY-MM-DD, for a file name. */
export function shopIsoDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

/** A date that names a day and no moment, such as a preferred date: read and
 * written in UTC, or a viewer west of it sees the day before. */
export function calendarDay(
  isoDate: string,
  locale: string | undefined,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}
