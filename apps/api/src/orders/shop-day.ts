/**
 * A moment as the day the shop's own pages call it, in the shop's timezone, so
 * a mail or a document names the same day as the page's "Last updated" line.
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
