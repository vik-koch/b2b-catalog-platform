/**
 * Formatting an integer minor-unit amount as money, in one implementation for
 * both sides. The browser has always done it; the order mails made the server
 * need it too, and two implementations of the same figure is how a mail comes
 * to disagree with the page it links to.
 */

export interface MoneyFormat {
  /** ISO 4217, e.g. "EUR". */
  readonly code: string;
  /** BCP 47, e.g. "de-DE". Absent falls back to the runtime's own locale,
   * which is what a deployment that configured none has asked for. */
  readonly locale?: string;
}

// Formatter construction is comparatively expensive; cache one per code+locale.
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: MoneyFormat): Intl.NumberFormat {
  const key = `${currency.locale ?? ''}:${currency.code}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
    });
    formatters.set(key, formatter);
  }
  return formatter;
}

/**
 * An integer minor-unit amount (1890) as a localised currency string
 * ("18,90 €"). The divisor comes from the currency itself, via the formatter's
 * resolved fraction digits, so zero-decimal (JPY) and three-decimal (BHD)
 * currencies need no special case.
 */
export function formatMoneyMinor(minor: number, currency: MoneyFormat): string {
  const formatter = formatterFor(currency);
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(minor / 10 ** digits);
}
