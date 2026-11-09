import { inject } from '@angular/core';

import {
  formatTaxRate,
  sharedTaxRate,
  TaxBasis,
} from '@b2b-catalog-platform/shared/core/catalog';
import { fillText } from '@b2b-catalog-platform/shared/platform';

import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { CATALOG_CONFIG } from './catalog-config';

/**
 * The tax basis in words (NFR-LEGAL-11), for every place that states it, so
 * a total and a price cannot word the same basis differently. A statement and
 * never a figure: the tax in an amount is the invoice's to state.
 */
export function useTaxStatement() {
  const tax = inject(CATALOG_CONFIG).tax;
  const locale = inject(DEPLOYMENT_CONFIG).locale;
  const statements = inject(SHARED_TEXT).tax;

  const rateText = (rate: number) => formatTaxRate(rate, locale);
  const statement = (basis: TaxBasis, rate: number | null): string => {
    if (basis === 'none') return statements.none;
    return rate === null
      ? statements.mixed[basis]
      : fillText(statements[basis], { rate: rateText(rate) });
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
      return rate === null
        ? ''
        : fillText(statements.line, { rate: rateText(rate) });
    },

    /** Beside a price, naming the product's rate as the API resolved it;
     * null where the deployment says nothing there, and under `none`, which
     * a total says once. */
    atPrice(rate: number | null): string | null {
      if (tax.basis === 'none' || !tax.statedAtPrices) return null;
      const said = statement(tax.basis, rate ?? tax.rate);
      return statements.atPrice
        ? fillText(statements.atPrice, { statement: said })
        : said;
    },

    /** Under a listing, naming no rate: one page may hold goods at two. */
    listing(): string | null {
      return tax.basis !== 'none' && tax.statedAtPrices
        ? statements.listing[tax.basis]
        : null;
    },
  };
}
