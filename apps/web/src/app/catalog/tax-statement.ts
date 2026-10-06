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

  const statement = (rate: number | null): string =>
    tax.basis === 'none'
      ? text.statement.none
      : fillText(text.statement[tax.basis], {
          rate: formatTaxRate(rate ?? tax.rate, locale),
        });

  return {
    /** Under a total: always said, `none` included, because a buyer who is
     * told nothing assumes the tax is in the price. */
    total: (): string => statement(null),

    /** Beside a price, naming the product's rate as the API resolved it;
     * null where the deployment says nothing there, and under `none`, which
     * a total says once. */
    atPrice(rate: number | null): string | null {
      return tax.basis !== 'none' && tax.statedAtPrices
        ? statement(rate)
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
