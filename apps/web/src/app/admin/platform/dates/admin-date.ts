/** The day as an admin column writes it: named numeric fields, one width in
 * every locale's own order, where a spelled month varies and `short` gives a
 * two-digit year. Detail screens keep their long forms. */
export function adminDayFormat(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

/** The same, with the time, for a single moment. */
export function adminMomentFormat(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
