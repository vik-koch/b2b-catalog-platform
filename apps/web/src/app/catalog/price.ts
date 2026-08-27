import {
  formatMoneyMinor,
  PIECE_PRICE_SCALE,
} from '@b2b-catalog-platform/shared';

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
 * string (e.g. "18,90 €"). The shared implementation, so a price on the page
 * and the same price in a mail cannot be written differently.
 */
export function formatPriceMinor(
  priceMinor: number,
  currency: CurrencyConfig,
): string {
  return formatMoneyMinor(priceMinor, currency);
}

/**
 * The same amount without its decimals ("1.250 €", "38 €") — for the header's
 * running total, where the figure is a glance rather than a receipt.
 *
 * Rounded, and deliberately so. The alternative is a figure that changes width
 * with its cents, and every time it does the navbar's icons move sideways; the
 * exact total is one click away on the cart page, which is where a receipt
 * belongs.
 */
export function formatPriceMinorShort(
  priceMinor: number,
  currency: CurrencyConfig,
): string {
  const digits = currencyFractionDigits(currency);
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(priceMinor / 10 ** digits);
}

/**
 * Format a per-piece price, which arrives in thousandths of a minor unit
 * because a single piece cannot always be priced in whole cents.
 *
 * Three decimal places, never more: the extra precision exists so the figure is
 * not rounded twice, not so it is all shown. A price that *is* exact in minor
 * units renders like any other, so only the inexact ones read differently.
 */
export function formatPiecePrice(
  milliMinor: number,
  currency: CurrencyConfig,
): string {
  const digits = currencyFractionDigits(currency);
  const exact = milliMinor % PIECE_PRICE_SCALE === 0;
  return new Intl.NumberFormat(currency.locale, {
    style: 'currency',
    currency: currency.code,
    minimumFractionDigits: digits,
    maximumFractionDigits: exact ? digits : Math.max(digits, 3),
  }).format(milliMinor / PIECE_PRICE_SCALE / 10 ** digits);
}

/** The currency's minor-unit exponent (2 for EUR, 0 for JPY, 3 for BHD). */
export function currencyFractionDigits(currency: CurrencyConfig): number {
  return formatterFor(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** Minor units → a major-unit number for a decimal input (e.g. 1890 → 18.9). */
export function minorToMajor(
  priceMinor: number,
  currency: CurrencyConfig,
): number {
  return priceMinor / 10 ** currencyFractionDigits(currency);
}

/** A major-unit input value → integer minor units, rounded (e.g. 18.9 → 1890). */
export function majorToMinor(
  priceMajor: number,
  currency: CurrencyConfig,
): number {
  return Math.round(priceMajor * 10 ** currencyFractionDigits(currency));
}

/** The decimal separator this deployment's locale writes prices with. */
export function decimalSeparator(currency: CurrencyConfig): string {
  return (
    formatterFor(currency)
      .formatToParts(1.1)
      .find((part) => part.type === 'decimal')?.value ?? '.'
  );
}

/**
 * Whether `text` could still become a price — what a price field is allowed to
 * *contain* while it is being typed, as opposed to what `parsePriceInput`
 * accepts as finished. "18," and "" are partial prices; "18,5x" and "18,555"
 * never become one, so the keystroke that would produce them is refused
 * instead of typed and rejected later.
 *
 * Precision is the currency's own: two decimals for EUR, none at all for JPY —
 * where a separator has nothing to introduce and is refused outright.
 */
export function isPartialPrice(
  text: string,
  currency: CurrencyConfig,
): boolean {
  const digits = currencyFractionDigits(currency);
  const pattern =
    digits > 0 ? new RegExp(`^\\d*([.,]\\d{0,${digits}})?$`) : /^\d*$/;
  return pattern.test(text);
}

/**
 * A price the admin typed → integer minor units, or `null` if it is not a
 * price at all.
 *
 * **Both separators are accepted, whatever the locale.** The deployment's
 * locale decides how a price is *shown*; it cannot decide which key someone
 * reaches for, and a German keyboard's numeric pad has a comma while the row
 * above the letters has a dot. Rejecting either would only produce "please
 * enter a valid price" for a price that was perfectly clear.
 *
 * A trailing separator ("18,") parses as the whole number, so a half-typed
 * value is not an error mid-keystroke — the field keeps the text either way,
 * this only decides what a save would store.
 */
export function parsePriceInput(
  input: string,
  currency: CurrencyConfig,
): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;
  // One separator, digits either side, nothing else — `Number()` alone would
  // accept "1e3", "0x10" and " " as numbers.
  if (!/^\d+([.,]\d*)?$/.test(trimmed)) return null;
  const major = Number(trimmed.replace(',', '.').replace(/\.$/, ''));
  return Number.isFinite(major) ? majorToMinor(major, currency) : null;
}

/**
 * Minor units → the text a price *field* starts with, in the deployment's
 * decimal separator and with the currency's full precision (18,90 rather than
 * 18,9). No currency symbol or grouping: this is an editable value, not a
 * label, and a thousands separator inside an input is only something to delete.
 */
export function formatPriceInput(
  priceMinor: number,
  currency: CurrencyConfig,
): string {
  const digits = currencyFractionDigits(currency);
  return minorToMajor(priceMinor, currency)
    .toFixed(digits)
    .replace('.', decimalSeparator(currency));
}
