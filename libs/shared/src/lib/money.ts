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

/** The currency's minor-unit exponent (2 for EUR, 0 for JPY, 3 for BHD). Read
 * off the formatter rather than tabulated, so no list has to be kept. */
export function currencyFractionDigits(currency: MoneyFormat): number {
  return formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** The decimal separator this currency's locale writes amounts with — read off
 * the same formatter, so a field's input rules and its output agree. */
export function decimalSeparator(currency: MoneyFormat): string {
  return (
    formatterFor(currency)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  );
}

/**
 * An integer minor-unit amount (1890) as a localised currency string
 * ("18,90 €"). The divisor comes from the currency itself, so zero-decimal
 * (JPY) and three-decimal (BHD) currencies need no special case.
 */
export function formatMoneyMinor(minor: number, currency: MoneyFormat): string {
  return formatterFor(currency).format(
    minor / 10 ** currencyFractionDigits(currency),
  );
}

/**
 * The symbol this currency is written with in this locale ("€", "$", "CHF") —
 * for a price *field*, which shows the unit beside the figure rather than
 * formatting one. Read off the same formatter as everything else here, so the
 * mark in the editor is the mark on the storefront.
 *
 * Falls back to the code, which is what a locale with no symbol for it already
 * renders.
 */
export function currencySymbol(currency: MoneyFormat): string {
  return (
    formatterFor(currency)
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency.code
  );
}
