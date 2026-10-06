/**
 * The tax basis prices are quoted on (NFR-LEGAL-11). A property of the seller,
 * never of a product: a shop either charges tax or it does not, and a total
 * adding net prices to gross ones would mean nothing.
 *
 * - `included` — the price is what the customer pays, tax in it.
 * - `added` — the tax is added on the invoice.
 * - `none` — no tax is charged.
 */
export const TAX_BASES = ['included', 'added', 'none'] as const;
export type TaxBasis = (typeof TAX_BASES)[number];

/** A rate is a percent with at most two decimals: 19, 7, 5.5. */
export const TAX_RATE_MAX = 100;

/**
 * A rate as the deployment writes numbers — "5,5" in German. The percent sign
 * stays in the text, since where it goes and whether a space precedes it
 * differ by language.
 */
export function formatTaxRate(rate: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    rate,
  );
}
