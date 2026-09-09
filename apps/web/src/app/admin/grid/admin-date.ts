/**
 * The day, as every admin list writes it.
 *
 * All-numeric rather than `dateStyle`, and the fields are named rather than
 * asked for as `short`: a spelled-out month is a different width in every
 * locale — some render a date column half again as wide as the date needs —
 * and `short` buys a two-digit year in others, which a list holding rows years
 * apart cannot afford. Named fields give one fixed-width day in every locale,
 * in that locale's own order and separators.
 *
 * Detail screens keep their long forms: they have one date to show and room to
 * spell it out. This is the one that is scanned down a column.
 */
export function adminDayFormat(locale: string): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}
