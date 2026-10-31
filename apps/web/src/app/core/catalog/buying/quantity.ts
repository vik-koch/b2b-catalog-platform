/**
 * A quantity's reading in the unit it is bought through (FR-UNIT-03/07):
 * stored in whole pieces, read as 0.2 bx, the one place a count has decimals.
 * The separator is the deployment's, as for prices.
 */
import { MoneyFormat, decimalSeparator } from '@b2b-catalog-platform/shared';
import { QUANTITY_SCALE } from '@b2b-catalog-platform/shared/core/catalog';

/** Trailing zeros trimmed and no grouping: an editable field holds it. */
export function formatUnitQuantity(
  quantity: number,
  currency: MoneyFormat,
): string {
  const text = String(Math.round(quantity * QUANTITY_SCALE) / QUANTITY_SCALE);
  return text.replace('.', decimalSeparator(currency));
}

/** A stored decimal such as a box's volume or weight ("0.072") in the
 * deployment's separator, its digits as stored. */
export function formatStoredDecimal(
  value: string,
  currency: MoneyFormat,
): string {
  return value.replace('.', decimalSeparator(currency));
}

/** Both separators, as `parsePriceInput` takes them; a trailing one reads
 * as the whole number. */
export function parseUnitQuantity(input: string): number | null {
  const trimmed = input.trim();
  if (!/^\d+([.,]\d*)?$/.test(trimmed)) return null;
  const value = Number(trimmed.replace(',', '.').replace(/\.$/, ''));
  return Number.isFinite(value) ? value : null;
}
