import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  OrderSyncPlan,
  OrderSyncRowError,
  OrderWriteResult,
} from '@b2b-catalog-platform/shared/core/exchange';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';

import { ADMIN_EXCHANGE_TEXT } from '../exchange-text';
import { SyncPlanTiles } from './sync-plan-tiles';
import { SyncRowErrors } from './sync-row-errors';

/**
 * What an order run did (FR-ADM-08): the counts, the orders it answered and
 * the instructions it could not carry out. Always a record: an order run is
 * applied as it arrives, so there is nothing to decide.
 */
@Component({
  selector: 'app-sync-order-plan-view',
  imports: [Link, RouterLink, StatusBadge, SyncPlanTiles, SyncRowErrors],
  template: `
    <section class="rounded-md border border-edge p-4">
      <h2 class="mb-4 text-lg font-normal tracking-tight">
        {{ text.summaryTitleApplied }}
      </h2>

      <app-sync-plan-tiles [tiles]="tiles()" />

      @if (isNoop()) {
        <p class="text-ink-subtle">{{ text.nothingChanged }}</p>
      }

      <app-sync-row-errors [errors]="rowErrors()" />

      @if (answered().length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium">
          {{ text.orders.ordersTitle }}
        </h3>
        <ul class="divide-y divide-edge-subtle text-sm">
          @for (order of answered(); track order.reference) {
            <li class="flex flex-wrap items-baseline gap-x-3 py-2">
              <span uiStatusBadge [tone]="kindTone(order.kind)">
                {{ text.orders.kind[order.kind] }}
              </span>
              <!-- The order itself, which says where it stands better than a
                   copy here would. -->
              <a
                uiLink
                class="font-medium"
                [routerLink]="['/admin/orders', order.reference]"
                >{{ order.reference }}</a
              >
              @if (order.notified) {
                <span class="text-ink-subtle">{{
                  text.orders.notifiedRow
                }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (plan().truncated) {
        <p class="mt-4 text-sm text-ink-subtle">{{ text.truncated }}</p>
      }
    </section>
  `,
})
export class SyncOrderPlanView {
  protected readonly text = inject(ADMIN_EXCHANGE_TEXT).sync;

  readonly plan = input.required<OrderSyncPlan>();

  /** Only the orders written: an unchanged one is counted, not listed, or a
   * re-sending feed fills the page. */
  protected readonly answered = computed(() =>
    this.plan().orders.filter(
      (order): order is AnsweredOrder => order.kind !== 'unchanged',
    ),
  );

  protected readonly isNoop = computed(
    () => this.plan().summary.update === 0 && this.plan().summary.errors === 0,
  );

  /** Mails earn their tile by happening; the rest hold their place. */
  protected readonly tiles = computed(() => {
    const s = this.plan().summary;
    return [
      { label: 'update' as const, value: s.update, danger: false },
      { label: 'unchanged' as const, value: s.unchanged, danger: false },
      { label: 'mailed' as const, value: s.mailed, danger: false },
      { label: 'errors' as const, value: s.errors, danger: s.errors > 0 },
    ]
      .filter((tile) => tile.value > 0 || tile.label !== 'mailed')
      .map((tile) => ({ ...tile, label: this.text.orders.count[tile.label] }));
  });

  protected readonly rowErrors = computed(() =>
    this.plan().rowErrors.map((error) => ({
      row: error.row,
      message: this.rowErrorText(error),
    })),
  );

  protected kindTone(kind: AnsweredOrder['kind']): StatusTone {
    return KIND_TONE[kind];
  }

  private rowErrorText(error: OrderSyncRowError): string {
    return fillText(this.text.orders.rowErrors[error.code], error.params ?? {});
  }
}

/** A change to what the order says is the loud one; a move is progress, a
 * payment settled news. */
const KIND_TONE: Record<AnsweredOrder['kind'], StatusTone> = {
  adjustment: 'waiting',
  transition: 'info',
  payment: 'ok',
};

/** An order this run wrote, as the list shows it. */
type AnsweredOrder = OrderWriteResult & {
  kind: Exclude<OrderWriteResult['kind'], 'unchanged'>;
};
