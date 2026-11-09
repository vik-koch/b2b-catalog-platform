import { Component, computed, inject, input } from '@angular/core';

import { OrderDetail } from '@b2b-catalog-platform/shared/core/ordering';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { StatusBadge } from '@b2b-catalog-platform/ui/content/status-badge';

import {
  orderPaymentLabel,
  orderPaymentTone,
  orderStatusLabel,
  orderStatusTone,
} from '../../../../core/ordering/order-status';
import { SHARED_ORDERING_TEXT } from '../../../../core/ordering/ordering-text';
import { DEPLOYMENT_CONFIG } from '../../../../platform/config/deployment-config';
import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';

/**
 * A customer's order as its page opens: reference, status, payment, when it
 * was placed, and why it stands or differs as it does. The same on the
 * account's page and on the one a mailed link opens.
 */
@Component({
  selector: 'app-order-heading',
  imports: [StatusBadge, PageTitle],
  host: { class: 'block' },
  template: `
    <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
      <h1 uiPageTitle>{{ order().reference }}</h1>
      <span uiStatusBadge [tone]="statusTone()">{{ statusLabel() }}</span>
      @if (paymentLabel(); as payment) {
        <span uiStatusBadge variant="dot" [tone]="paymentTone()">
          {{ payment }}
        </span>
      }
    </div>
    <p class="mt-2 text-ink-subtle">{{ placed() }}</p>
    <!-- Under the status: the reason and the shop's changes are part of it. -->
    @if (order().statusReason; as reason) {
      <p class="mt-1 text-ink-subtle">{{ names.reason }}: {{ reason }}</p>
    }
    @if (order().changes.length) {
      <div class="mt-1 text-ink-subtle">
        {{ names.changeNote }}:
        @for (change of order().changes; track $index) {
          <span class="block">{{ change }}</span>
        }
      </div>
    }
  `,
})
export class OrderHeading {
  private readonly placedText = inject(STOREFRONT_ORDERING_TEXT).orders.detail
    .placed;
  protected readonly names = inject(SHARED_ORDERING_TEXT).order;
  private readonly dateFormat = new Intl.DateTimeFormat(
    inject(DEPLOYMENT_CONFIG).locale,
    { dateStyle: 'long' },
  );

  readonly order = input.required<OrderDetail>();

  protected readonly placed = computed(() =>
    fillText(this.placedText, {
      date: this.dateFormat.format(new Date(this.order().createdAt)),
    }),
  );
  protected readonly statusLabel = computed(() =>
    orderStatusLabel(
      this.order().status,
      this.order().fulfilmentMethod,
      this.names.statuses,
    ),
  );
  protected readonly statusTone = computed(() =>
    orderStatusTone(
      this.order().status,
      'customer',
      this.order().fulfilmentMethod,
    ),
  );
  protected readonly paymentLabel = computed(() =>
    orderPaymentLabel(this.order().paymentState, this.names.paymentStates),
  );
  protected readonly paymentTone = computed(() =>
    orderPaymentTone(this.order().paymentState),
  );
}
