/**
 * A moment as the shop's own day, as the pages' "Last updated" line names it.
 */
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

/** The same day as YYYY-MM-DD, for a file name. */
export function shopIsoDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}
