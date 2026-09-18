import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  OrderSyncPlan,
  OrderSyncRowError,
  OrderWriteResult,
  fillText,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Link } from '../../ui/link';
import { StatusBadge, StatusTone } from '../../ui/status-badge';

/**
 * What an order run did (FR-ADM-08): the counts, the orders it answered, and
 * the instructions it could not carry out.
 *
 * The third sibling of `SyncPlanView`, and the shortest of them, because it is
 * the only one with nothing to decide. An order write-back is applied as it
 * arrives (ADR 0062), so this never shows an apply button, a discard button or
 * a typed confirmation — it is always a record of something that has already
 * happened, which is also why every line of it links to the order itself.
 */
@Component({
  selector: 'app-sync-order-plan-view',
  imports: [Link, RouterLink, StatusBadge],
  template: `
    <section class="rounded-md border border-border p-4">
      <h2 class="mb-4 text-lg font-normal tracking-tight">
        {{ text.summaryTitleApplied }}
      </h2>

      <dl class="mb-6 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        @for (tile of tiles(); track tile.label) {
          <div>
            <dt class="text-subtle">{{ text.orders.count[tile.label] }}</dt>
            <dd class="text-lg font-medium" [class.text-red-700]="tile.danger">
              {{ tile.value }}
            </dd>
          </div>
        }
      </dl>

      @if (isNoop()) {
        <p class="text-muted">{{ text.nothingChanged }}</p>
      }

      @if (plan().rowErrors.length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium text-red-700">
          {{ text.errorsTitle }}
        </h3>
        <ul class="space-y-1 text-sm text-stone-700">
          @for (error of plan().rowErrors; track $index) {
            <li>
              <span class="text-subtle">{{ rowLabel(error.row) }}</span>
              — {{ rowErrorText(error) }}
            </li>
          }
        </ul>
      }

      @if (answered().length > 0) {
        <h3 class="mt-6 mb-2 text-sm font-medium">
          {{ text.orders.ordersTitle }}
        </h3>
        <ul class="divide-y divide-stone-100 text-sm">
          @for (order of answered(); track order.reference) {
            <li class="flex flex-wrap items-baseline gap-x-3 py-2">
              <span appStatusBadge [tone]="kindTone(order.kind)">
                {{ text.orders.kind[order.kind] }}
              </span>
              <!-- The order itself, not the version this run wrote, and no
                   restatement of where it now stands: a reader opening a row
                   from a log wants the order, and the order's own page says
                   what it says better than a copy of it in a log would. -->
              <a
                appLink
                class="font-medium"
                [routerLink]="['/admin/orders', order.reference]"
                >{{ order.reference }}</a
              >
              @if (order.notified) {
                <span class="text-subtle">{{ text.orders.notifiedRow }}</span>
              }
            </li>
          }
        </ul>
      }

      @if (plan().truncated) {
        <p class="mt-4 text-sm text-subtle">{{ text.truncated }}</p>
      }
    </section>
  `,
})
export class SyncOrderPlanView {
  protected readonly text = inject(ADMIN_TEXT).sync;

  readonly plan = input.required<OrderSyncPlan>();

  /** The orders this run actually wrote. One that already said what the run
   * said is counted and not listed: a feed that re-sends everything it has
   * would otherwise fill the page with orders nothing happened to. */
  protected readonly answered = computed(() =>
    this.plan().orders.filter((order) => order.kind !== 'unchanged'),
  );

  protected readonly isNoop = computed(
    () => this.plan().summary.update === 0 && this.plan().summary.errors === 0,
  );

  /**
   * Three counts are an answer even at zero — nothing answered, nothing left
   * as it was, nothing skipped — and hold their place so the row does not
   * rearrange itself between runs. Mails earn their tile by happening.
   */
  protected readonly tiles = computed(() => {
    const s = this.plan().summary;
    return [
      { label: 'update' as const, value: s.update, danger: false },
      { label: 'unchanged' as const, value: s.unchanged, danger: false },
      { label: 'mailed' as const, value: s.mailed, danger: false },
      { label: 'errors' as const, value: s.errors, danger: s.errors > 0 },
    ].filter((tile) => tile.value > 0 || tile.label !== 'mailed');
  });

  protected kindTone(kind: OrderWriteResult['kind']): StatusTone {
    return KIND_TONE[kind];
  }

  protected rowErrorText(error: OrderSyncRowError): string {
    return fillText(this.text.orders.rowErrors[error.code], error.params ?? {});
  }

  protected rowLabel(row: number): string {
    return fillText(this.text.errorRow, { row });
  }
}

/**
 * What each kind of answer reads as. A change to what the order says is the
 * loud one — somebody is being sent different goods or a different total — a
 * move is ordinary progress, and a payment is settled news.
 */
const KIND_TONE: Record<OrderWriteResult['kind'], StatusTone> = {
  adjustment: 'waiting',
  transition: 'info',
  payment: 'ok',
  unchanged: 'neutral',
};
