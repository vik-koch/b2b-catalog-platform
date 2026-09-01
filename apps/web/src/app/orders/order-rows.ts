import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  OrderStatus,
  OrderSummary,
} from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { StatusBadge, StatusTone } from '../ui/status-badge';
import { orderStatusTone } from './order-status';

/**
 * The account's orders as rows — the whole history on its own page, and the
 * most recent handful on the account page. One component for both, because
 * they are the same list read at two lengths, and two copies of a row is how
 * the two end up disagreeing about what an order looks like.
 *
 * Rows rather than a table: the customer side reads on a phone as often as on
 * a desk, and four columns of one order each are what the account page already
 * draws for saved addresses.
 */
@Component({
  selector: 'app-order-rows',
  imports: [RouterLink, StatusBadge],
  host: { class: 'block' },
  template: `
    <ul class="divide-y divide-border">
      @for (order of orders(); track order.reference) {
        <li>
          <!-- The whole row opens the order: the reference is the only thing on
               it worth clicking, and a link around it is a bigger target than
               the text. -->
          <a
            class="-mx-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-md px-2 py-4 hover:bg-stone-50"
            [routerLink]="['/account/orders', order.reference]"
          >
            <div>
              <p class="text-sm font-medium">{{ order.reference }}</p>
              <p class="mt-1 text-sm text-muted">
                {{ formatDate(order.createdAt) }} ·
                {{ lineCount(order.itemCount) }}
              </p>
            </div>
            <div class="flex items-center gap-4">
              <span appStatusBadge [tone]="statusTone(order.status)">
                {{ statusLabel(order.status) }}
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
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;
  private readonly text = inject(APP_TEXT).orders;

  readonly orders = input.required<readonly OrderSummary[]>();

  protected total(order: OrderSummary): string {
    return formatPriceMinor(order.totalMinor, this.currency);
  }

  protected lineCount(count: number): string {
    return fillText(this.text.itemCount, { count });
  }

  protected statusLabel(status: OrderStatus): string {
    return {
      requested: this.text.statusRequested,
      approved: this.text.statusApproved,
      declined: this.text.statusDeclined,
      cancelled: this.text.statusCancelled,
    }[status];
  }

  protected statusTone(status: OrderStatus): StatusTone {
    return orderStatusTone(status);
  }

  protected formatDate(iso: string): string {
    return this.dateFormat.format(new Date(iso));
  }

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'long',
  });
}
