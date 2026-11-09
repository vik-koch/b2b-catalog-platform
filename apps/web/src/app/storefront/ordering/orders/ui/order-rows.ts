import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { OrderSummary } from '@b2b-catalog-platform/shared/core/ordering';
import {
  fillText,
  formatMoneyMinor,
  moneyFormat,
} from '@b2b-catalog-platform/shared/platform';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';

import {
  orderPaymentLabel,
  orderPaymentTone,
  orderStatusLabel,
  orderStatusTone,
} from '../../../../core/ordering/order-status';
import { SHARED_ORDERING_TEXT } from '../../../../core/ordering/ordering-text';
import { DEPLOYMENT_CONFIG } from '../../../../platform/config/deployment-config';
import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';

/** The account's orders as rows, on the history page and the account page.
 * Rows, not a table: customers read this on phones. */
@Component({
  selector: 'app-order-rows',
  imports: [RouterLink, StatusBadge],
  host: { class: 'block' },
  template: `
    <ul class="divide-y divide-edge">
      @for (order of orders(); track order.reference) {
        <li class="-mx-2 py-3 first:pt-0 last:pb-0">
          <a
            class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2
                   rounded-md px-2
                   hover:bg-surface-subtle-hover"
            [routerLink]="['/account/orders', order.reference]"
          >
            <div>
              <p class="text-sm font-medium">{{ order.reference }}</p>
              <p class="mt-1 text-sm text-ink-subtle">
                {{ formatDate(order.createdAt) }} ·
                {{ lineCount(order.itemCount) }}
              </p>
            </div>
            <div
              class="flex flex-wrap items-center justify-end gap-x-4 gap-y-1"
            >
              @if (paymentLabel(order); as payment) {
                <span uiStatusBadge variant="dot" [tone]="paymentTone(order)">
                  {{ payment }}
                </span>
              }
              <span uiStatusBadge [tone]="statusTone(order)">
                {{ statusLabel(order) }}
              </span>
              <p class="text-sm font-medium tabular-nums">
                {{ total(order) }}
              </p>
            </div>
          </a>
        </li>
      }
    </ul>
  `,
})
export class OrderRows {
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));
  private readonly locale = inject(DEPLOYMENT_CONFIG).locale;
  private readonly text = inject(STOREFRONT_ORDERING_TEXT).orders;
  private readonly statusNames = inject(SHARED_ORDERING_TEXT).order;

  readonly orders = input.required<readonly OrderSummary[]>();

  protected total(order: OrderSummary): string {
    return formatMoneyMinor(order.totalMinor, this.currency);
  }

  protected lineCount(count: number): string {
    return fillText(this.text.itemCount, { count });
  }

  protected statusLabel(order: OrderSummary): string {
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.statusNames.statuses,
    );
  }

  protected statusTone(order: OrderSummary): StatusTone {
    return orderStatusTone(order.status, 'customer', order.fulfilmentMethod);
  }

  protected paymentLabel(order: OrderSummary): string | null {
    return orderPaymentLabel(
      order.paymentState,
      this.statusNames.paymentStates,
    );
  }

  protected paymentTone(order: OrderSummary): StatusTone {
    return orderPaymentTone(order.paymentState);
  }

  protected formatDate(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.locale, {
    dateStyle: 'long',
  });
}
