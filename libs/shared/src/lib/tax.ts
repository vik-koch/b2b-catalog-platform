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

/**
 * The rate a product is taxed at: its own, or the deployment's default. Null
 * where no tax is charged, whatever rate the product carries — under `none` a
 * product's rate is kept for the day the shop becomes liable, and is not in
 * effect until then.
 */
export function effectiveTaxRate(
  tax: { basis: TaxBasis; rate?: number },
  own: number | null,
): number | null {
  if (tax.basis === 'none') return null;
  return own ?? tax.rate ?? null;
}

/**
 * A rate as typed — in a CSV cell or the editor's field — with a comma
 * accepted for the decimal point, since a spreadsheet in most of Europe
 * writes 5,5. Empty is null, the default rate; undefined is not a rate.
 */
export function parseTaxRate(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d{1,3}([.,]\d{1,2})?$/.test(trimmed)) return undefined;
  const rate = Number(trimmed.replace(',', '.'));
  return rate <= TAX_RATE_MAX ? rate : undefined;
}

/**
 * Whether a rate field may hold this text on the way to a rate — what
 * `parseTaxRate` accepts, and every prefix of it. A third decimal or a figure
 * past 100 is refused as it is typed rather than reported on save.
 */
export function isPartialTaxRate(text: string): boolean {
  if (!/^\d{0,3}([.,]\d{0,2})?$/.test(text)) return false;
  const digits = text.replace(',', '.');
  return digits === '' || digits === '.' || Number(digits) <= TAX_RATE_MAX;
}

/**
 * The one rate every line of a cart or an order shares, which its total then
 * names (NFR-LEGAL-11). Null once two lines differ — the total then states
 * only the basis and each line its own rate — and null where a line has no
 * rate to share. Undefined for no lines at all, which name nothing either way.
 */
export function sharedTaxRate(
  rates: readonly (number | null)[],
): number | null | undefined {
  if (rates.length === 0) return undefined;
  const [first] = rates;
  return rates.every((rate) => rate === first) ? first : null;
}
