/** Money formatting for both sides, so a mail states the figure its page does. */

export interface MoneyFormat {
  /** ISO 4217, e.g. "EUR". */
  readonly code: string;
  /** BCP 47, e.g. "de-DE": the deployment's locale. */
  readonly locale: string;
}

export function moneyFormat(config: {
  readonly locale: string;
  readonly catalog: { readonly currency: { readonly code: string } };
}): MoneyFormat {
  return { code: config.catalog.currency.code, locale: config.locale };
}

// Constructing a formatter is expensive: one per locale and code.
const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: MoneyFormat): Intl.NumberFormat {
  const key = `${currency.locale}:${currency.code}`;
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

/** The minor-unit exponent (2 for EUR, 0 for JPY, 3 for BHD), read off the
 * formatter so no table has to be kept. */
export function currencyFractionDigits(currency: MoneyFormat): number {
  return formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Read off the same formatter, so a field's input rule and its output agree. */
export function decimalSeparator(currency: MoneyFormat): string {
  return (
    formatterFor(currency)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  );
}

/** An integer minor-unit amount (1890) as "18,90 €". */
export function formatMoneyMinor(minor: number, currency: MoneyFormat): string {
  return formatterFor(currency).format(
    minor / 10 ** currencyFractionDigits(currency),
  );
}

/** The mark a price field shows beside its figure ("€", "CHF"); the code
 * where the locale has no symbol, as the formatter itself writes it. */
export function currencySymbol(currency: MoneyFormat): string {
  return (
    formatterFor(currency)
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value ?? currency.code
  );
}
