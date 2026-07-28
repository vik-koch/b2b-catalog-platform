/**
 * Prices travel as integer minor units (see the catalog contract). Formatting
 * is a per-deployment concern: the currency code and locale come from
 * deployment config, never from the API.
 */

export interface CurrencyConfig {
  /** ISO 4217, e.g. "EUR". */
  code: string;
  /** BCP 47 locale, e.g. "de-DE". */
  locale: string;
}

// Formatter construction is comparatively expensive; cache one per code+locale.
const formatterCache = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: CurrencyConfig): Intl.NumberFormat {
  const key = `${currency.locale}:${currency.code}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code,
    });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

/**
 * Format an integer minor-unit amount (e.g. 1890) as a localised currency
 * string (e.g. "18,90 €"). The minor-unit divisor is derived from the currency
 * itself via the formatter's resolved fraction digits, so zero-decimal (JPY)
 * and three-decimal (BHD) currencies are handled without special-casing.
 */
export function formatPriceMinor(
  priceMinor: number,
  currency: CurrencyConfig,
): string {
  const formatter = formatterFor(currency);
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(priceMinor / 10 ** fractionDigits);
}
