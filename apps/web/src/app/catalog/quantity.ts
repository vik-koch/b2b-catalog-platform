import { CurrencyConfig, decimalSeparator } from './price';

/**
 * Reading and writing a quantity in the unit it is being bought through
 * (FR-UNIT-03/07). A quantity is stored in pieces and is always a whole number
 * of them; what these format and parse is the *reading* — 0.2 bx for two packs
 * of a ten-pack box — which is the only place in the app a count has decimals.
 *
 * The separator is the deployment's, taken from the currency's locale, which is
 * the one locale this app has: a shop that writes prices with a comma does not
 * write quantities with a point.
 */

/** Up to three decimals, trailing zeros trimmed, no grouping — this is what an
 * editable field holds, and "3,000" is only something to delete. */
export function formatUnitQuantity(
  quantity: number,
  currency: CurrencyConfig,
): string {
  const text = String(Math.round(quantity * 1000) / 1000);
  return text.replace('.', decimalSeparator(currency));
}

/**
 * What was typed, or null where it is not a quantity at all.
 *
 * **Both separators are accepted, whatever the locale** — the same rule
 * `parsePriceInput` follows, and for the same reason: the locale decides how a
 * figure is shown, never which key someone reaches for. A trailing separator
 * parses as the whole number, so a half-typed value is not an error
 * mid-keystroke.
 */
export function parseUnitQuantity(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+([.,]\d*)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.').replace(/\.$/, ''));
  return Number.isFinite(value) ? value : null;
}
