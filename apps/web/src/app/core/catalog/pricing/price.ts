import {
  currencyFractionDigits,
  decimalSeparator,
  MoneyFormat,
} from '@b2b-catalog-platform/shared';

/**
 * The amount without its decimals ("1.250 €"), for the header's running
 * total: a figure that changed width with its cents would move the navbar's
 * icons. The exact total is on the cart page.
 */
export function formatPriceMinorShort(
  priceMinor: number,
  currency: MoneyFormat,
): string {
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(minorToMajor(priceMinor, currency));
}

function minorToMajor(priceMinor: number, currency: MoneyFormat): number {
  return priceMinor / 10 ** currencyFractionDigits(currency);
}

function majorToMinor(priceMajor: number, currency: MoneyFormat): number {
  return Math.round(priceMajor * 10 ** currencyFractionDigits(currency));
}

/**
 * Whether `text` could still become a price, so a price field refuses the
 * keystroke that never could ("18,5x", "18,555") instead of typing it. The
 * precision is the currency's: no separator at all for JPY.
 */
export function isPartialPrice(text: string, currency: MoneyFormat): boolean {
  const digits = currencyFractionDigits(currency);
  const pattern =
    digits > 0 ? new RegExp(`^\\d*([.,]\\d{0,${digits}})?$`) : /^\d*$/;
  return pattern.test(text);
}

/** `isPartialPrice` bound to a currency, for `[uiAllow]`. */
export function partialPriceRule(
  currency: MoneyFormat,
): (text: string) => boolean {
  return (text) => isPartialPrice(text, currency);
}

/**
 * A typed price in minor units, or null. Both separators, whatever the
 * locale: it decides how a price is shown, not which key a German numeric pad
 * has. A trailing separator ("18,") reads as the whole number.
 */
export function parsePriceInput(
  input: string,
  currency: MoneyFormat,
): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // `Number()` alone would take "1e3", "0x10" and " ".
  if (!/^\d+([.,]\d*)?$/.test(trimmed)) return null;
  const major = Number(trimmed.replace(',', '.').replace(/\.$/, ''));
  return Number.isFinite(major) ? majorToMinor(major, currency) : null;
}

/**
 * The text a price field starts with: the deployment's separator, the
 * currency's full precision (18,90), and no symbol or grouping, which are only
 * something to delete in an input.
 */
export function formatPriceInput(
  priceMinor: number,
  currency: MoneyFormat,
): string {
  return minorToMajor(priceMinor, currency)
    .toFixed(currencyFractionDigits(currency))
    .replace('.', decimalSeparator(currency));
}
