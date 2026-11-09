/** The day as an admin column writes it: named numeric fields, one width in
 * every locale's own order, where a spelled month varies and `short` gives a
 * two-digit year. Detail screens keep their long forms. A moment's day is the
 * shop's: pass its time zone. */
export function adminDayFormat(
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  });
}

/** The same for a date that names a day and no moment, such as an expiry:
 * read and written in UTC, or a viewer west of it sees the day before. */
export function adminCalendarDayFormat(locale: string): Intl.DateTimeFormat {
  return adminDayFormat(locale, 'UTC');
}

/** The same, with the time, for a single moment. */
export function adminMomentFormat(
  locale: string,
  timeZone: string,
): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
}
