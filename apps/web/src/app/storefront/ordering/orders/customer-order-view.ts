import { computed, inject, Signal } from '@angular/core';
import {
  formatMoneyMinor,
  moneyFormat,
} from '@b2b-catalog-platform/shared/platform';
import { OrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { useTaxStatement } from '../../../core/catalog/pricing/tax-statement';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import {
  injectCustomerBlockLabels,
  orderBlocks,
} from '../../../core/ordering/order-blocks';
import { customerQuantity } from '../../../core/ordering/order-formats';
import {
  ReadBackLine,
  ReviewBlock,
} from '../../../core/ordering/ui/order-read-back';

/** What a customer's order page reads back; call in an injection context. */
export function useCustomerOrderView(order: Signal<OrderDetail | null>): {
  taxRates: Signal<(number | null)[]>;
  lines: Signal<ReadBackLine[]>;
  blocks: Signal<ReviewBlock[]>;
} {
  const config = inject(DEPLOYMENT_CONFIG);
  const currency = moneyFormat(config);
  const sharedText = inject(SHARED_TEXT);
  const labels = injectCustomerBlockLabels();
  const tax = useTaxStatement();

  const taxRates = computed(
    () => order()?.lines.map((line) => line.taxRate) ?? [],
  );

  const lines = computed<ReadBackLine[]>(() => {
    const detail = order();
    if (!detail) return [];
    // Rates on the lines only once they differ; otherwise the total names it.
    const perLine = tax.perLine(taxRates(), detail.taxBasis);
    return detail.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: customerQuantity(line, sharedText, currency),
      total: formatMoneyMinor(line.lineTotalMinor, currency),
      taxRate: perLine ? tax.line(line.taxRate) : null,
    }));
  });

  const blocks = computed<ReviewBlock[]>(() => {
    const detail = order();
    return detail
      ? orderBlocks(detail, labels, {
          address: config.address,
          phoneInput: config.phoneInput,
          locale: config.locale,
        })
      : [];
  });

  return { taxRates, lines, blocks };
}
