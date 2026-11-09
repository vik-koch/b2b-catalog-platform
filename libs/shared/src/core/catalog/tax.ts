/**
 * The tax basis prices are quoted on (NFR-LEGAL-11): the seller's, never a
 * product's, as a total adding net prices to gross ones would mean nothing.
 * `included`: tax is in the price; `added`: on the invoice; `none`: not charged.
 */
export const TAX_BASES = ['included', 'added', 'none'] as const;
export type TaxBasis = (typeof TAX_BASES)[number];

/** A rate is a percent with at most two decimals: 19, 7, 5.5. */
export const TAX_RATE_MAX = 100;

/** "5,5" in German. The percent sign stays in the text, as its place differs
 * by language. */
export function formatTaxRate(rate: number, locale?: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
    rate,
  );
}

/** A product's own rate or the default. Null under `none`, whatever the
 * product carries: its rate is kept for the day the shop becomes liable. */
export function effectiveTaxRate(
  tax: { basis: TaxBasis; rate?: number },
  own: number | null,
): number | null {
  if (tax.basis === 'none') return null;
  return own ?? tax.rate ?? null;
}

/** A rate as typed in a CSV cell or the editor, a decimal comma accepted.
 * Empty is null, the default rate; undefined is not a rate. */
export function parseTaxRate(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(trimmed)) return undefined;
  const rate = Number(trimmed.replace(',', '.'));
  return rate <= TAX_RATE_MAX ? rate : undefined;
}

/** What `parseTaxRate` accepts and every prefix of it, so a field refuses a
 * third decimal or a figure past 100 as it is typed. */
export function isPartialTaxRate(text: string): boolean {
  if (!/^\d{0,3}([.,]\d{0,2})?$/.test(text)) return false;
  const digits = text.replace(',', '.');
  return digits === '' || digits === '.' || Number(digits) <= TAX_RATE_MAX;
}

/** The rate every line shares, which the total names (NFR-LEGAL-11). Null
 * once two lines differ or a line has none; undefined for no lines. */
export function sharedTaxRate(
  rates: readonly (number | null)[],
): number | null | undefined {
  if (rates.length === 0) return undefined;
  const [first] = rates;
  return rates.every((rate) => rate === first) ? first : null;
}
