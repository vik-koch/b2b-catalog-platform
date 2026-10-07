import { inject } from '@angular/core';
import {
  fillText,
  formatTaxRate,
  sharedTaxRate,
  TaxBasis,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/**
 * The tax basis in words (NFR-LEGAL-11), for every place that states it, so
 * a total and a price cannot word the same basis differently. A statement and
 * never a figure: the tax in an amount is the invoice's to state.
 */
export function useTaxStatement() {
  const config = inject(DEPLOYMENT_CONFIG);
  const tax = config.tax;
  const locale = config.catalog.currency.locale;
  const text = inject(APP_TEXT).tax;

  const rateText = (rate: number) => formatTaxRate(rate, locale);
  const statement = (basis: TaxBasis, rate: number | null): string => {
    if (basis === 'none') return text.statement.none;
    return rate === null
      ? text.mixed[basis]
      : fillText(text.statement[basis], { rate: rateText(rate) });
  };
  const defaultRate = tax.basis === 'none' ? null : tax.rate;

  return {
    /**
     * Under a total: always said, `none` included, because a buyer who is
     * told nothing assumes the tax is in the price. Names the rate the lines
     * share, or only the basis once they differ. An order passes its own
     * basis; a cart is quoted on the deployment's.
     */
    total(
      rates: readonly (number | null)[],
      basis: TaxBasis = tax.basis,
    ): string {
      const shared = sharedTaxRate(rates);
      return statement(basis, shared === undefined ? defaultRate : shared);
    },

    /** Whether the lines state their own rates: only once they differ, since
     * a rate the total already names would be said on every line for nothing. */
    perLine(rates: readonly (number | null)[], basis: TaxBasis = tax.basis) {
      return basis !== 'none' && sharedTaxRate(rates) === null;
    },

    /** One line's rate, as a line states it. */
    line(rate: number | null): string {
      return rate === null ? '' : fillText(text.line, { rate: rateText(rate) });
    },

    /** Beside a price, naming the product's rate as the API resolved it;
     * null where the deployment says nothing there, and under `none`, which
     * a total says once. */
    atPrice(rate: number | null): string | null {
      return tax.basis !== 'none' && tax.statedAtPrices
        ? statement(tax.basis, rate ?? tax.rate)
        : null;
    },

    /** Under a listing, naming no rate: one page may hold goods at two. */
    listing(): string | null {
      return tax.basis !== 'none' && tax.statedAtPrices
        ? text.listing[tax.basis]
        : null;
    },
  };
}
