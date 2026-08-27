import { Component, computed, inject, input } from '@angular/core';
import { ShipmentSummary } from '@b2b-catalog-platform/shared';
import { formatPriceMinor } from '../catalog/price';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { fillText } from '../core/fill-text';
import { Skeleton } from '../ui/skeleton';

/**
 * What the order comes to — the same card on the cart, on checkout and on the
 * preview before sending, so a customer reads one summary through the whole
 * flow rather than three renderings of the same figures.
 *
 * One card, read top to bottom: what the order is, what it will weigh and take
 * up, and what it costs. Splitting the total into a card of its own made the
 * customer read two boxes to answer one question.
 *
 * It says nothing about how or when the order arrives. On the cart there is
 * nothing to say, and a row reading "confirmed with your order" against every
 * label is a table of placeholders; on checkout the form beside it is already
 * asking those questions, and reading the answers back a line later is not a
 * summary, it is an echo. What the page does have to add — the delivery area
 * and its threshold — is projected underneath.
 */
@Component({
  selector: 'app-order-summary',
  imports: [Skeleton],
  host: { class: 'block' },
  template: `
    <div class="rounded-lg border border-border p-5">
      <h2 class="mb-3 font-medium">{{ text.summaryTitle }}</h2>
      <dl class="space-y-2 text-sm">
        <!-- How many lines is the cart's own answer, so it is stated before
             the estimate and whether or not one arrives. -->
        <div class="flex items-baseline justify-between gap-4">
          <dt class="text-subtle">{{ text.summaryLines }}</dt>
          <dd class="text-right">{{ lineCount() }}</dd>
        </div>
        @for (row of rows(); track row.label) {
          <div class="flex items-baseline justify-between gap-4">
            <dt class="text-subtle">{{ row.label }}</dt>
            <dd class="text-right">{{ row.value }}</dd>
          </div>
        } @empty {
          @if (loading()) {
            <app-skeleton [lines]="3" />
          }
        }
        <div
          class="flex items-baseline justify-between gap-4 border-t border-border pt-3"
        >
          <dt class="text-subtle">{{ text.subtotal }}</dt>
          <dd class="text-xl font-bold text-primary">{{ subtotal() }}</dd>
        </div>
      </dl>

      @if (!complete()) {
        <p class="mt-2 text-sm text-amber-700">{{ text.totalIncomplete }}</p>
      }
      @if (hasEstimate()) {
        <p class="mt-3 text-xs text-subtle">{{ text.shipmentApproximate }}</p>
        @if (uncovered(); as count) {
          <p class="mt-1 text-xs text-amber-700">{{ uncoveredMessage() }}</p>
        }
      }

      <!-- Whatever the page has to add under the figures — the delivery area
           and what it takes to be free of charge, on checkout. -->
      <div class="empty:hidden"><ng-content /></div>
    </div>
  `,
})
export class OrderSummary {
  private readonly boxUnits = inject(DEPLOYMENT_CONFIG).catalog.boxUnits;
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected readonly text = inject(APP_TEXT).cart;

  readonly lineCount = input.required<number>();
  readonly subtotalMinor = input.required<number>();
  readonly complete = input(true);
  /** Null before a line has ever been priced: there is nothing to add up yet. */
  readonly shipment = input<ShipmentSummary | null>(null);
  readonly loading = input(false);

  protected readonly subtotal = computed(() =>
    formatPriceMinor(this.subtotalMinor(), this.currency),
  );

  protected readonly hasEstimate = computed(() => {
    const shipment = this.shipment();
    return shipment !== null && shipment.coveredLines > 0;
  });

  protected readonly uncovered = computed(() => {
    const count = this.shipment()?.uncoveredLines ?? 0;
    return count > 0 ? count : null;
  });

  protected readonly uncoveredMessage = computed(() =>
    fillText(this.text.shipmentUncovered, { count: this.uncovered() ?? 0 }),
  );

  /**
   * The estimate as labelled rows (FR-UNIT-11). A table rather than sentences:
   * a customer checking a consignment is comparing figures against a delivery
   * note, and figures compare by lining up.
   *
   * What the consignment weighs and measures first, then how many cartons that
   * comes to — the order those figures are read in.
   */
  protected readonly rows = computed<{ label: string; value: string }[]>(() => {
    const shipment = this.shipment();
    const rows: { label: string; value: string }[] = [];

    if (shipment && shipment.coveredLines > 0) {
      if (shipment.weight) {
        rows.push({
          label: this.text.shipmentWeight,
          value: `${shipment.weight} ${this.boxUnits.weight}`,
        });
      }
      if (shipment.volume) {
        rows.push({
          label: this.text.shipmentVolume,
          value: `${shipment.volume} ${this.boxUnits.volume}`,
        });
      }
      rows.push({
        label: this.text.shipmentCartons,
        value: String(shipment.cartons),
      });
    }

    return rows;
  });
}
