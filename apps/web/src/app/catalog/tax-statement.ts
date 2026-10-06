import { inject } from '@angular/core';
import { fillText, formatTaxRate } from '@b2b-catalog-platform/shared';
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

  const statement = (): string =>
    tax.basis === 'none'
      ? text.statement.none
      : fillText(text.statement[tax.basis], {
          rate: formatTaxRate(tax.rate, locale),
        });

  return {
    /** Under a total: always said, `none` included, because a buyer who is
     * told nothing assumes the tax is in the price. */
    total: statement,

    /** Beside a price, where the deployment states it there; null otherwise
     * and under `none`, which a total says once. */
    atPrice(): string | null {
      return tax.basis !== 'none' && tax.statedAtPrices ? statement() : null;
    },

    /** Under a listing, naming no rate: one page may hold goods at two. */
    listing(): string | null {
      return tax.basis !== 'none' && tax.statedAtPrices
        ? text.listing[tax.basis]
        : null;
    },
  };
}
