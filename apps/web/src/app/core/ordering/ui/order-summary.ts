import { TaxBasis } from '@b2b-catalog-platform/shared/core/catalog';
import { Component, computed, inject, input } from '@angular/core';
import {
  fillText,
  moneyFormat,
  formatMoneyMinor,
} from '@b2b-catalog-platform/shared/platform';
import { ShipmentSummary } from '@b2b-catalog-platform/shared/core/ordering';
import { formatStoredDecimal } from '../../catalog/buying/quantity';
import { useTaxStatement } from '../../catalog/tax-statement';
import { SHARED_ORDERING_TEXT } from '../ordering-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { CATALOG_CONFIG } from '../../catalog/catalog-config';

/**
 * What the order comes to: the same card on the cart, checkout and the order
 * pages. Silent on how and when it arrives: the cart has no answer yet and
 * checkout asks it beside the card. A page adds its own lines underneath.
 */
@Component({
  selector: 'app-order-summary',
  imports: [Card, WarningNote, Skeleton],
  host: { class: 'block' },
  template: `
    <div uiCard>
      <h2 class="mb-3 font-medium">{{ text.title }}</h2>
      <dl class="space-y-2 text-sm">
        <!-- Before the estimate, which may never arrive. -->
        <div class="flex items-baseline justify-between gap-4">
          <dt class="text-ink-subtle">{{ text.lines }}</dt>
          <dd class="text-right">{{ lineCount() }}</dd>
        </div>
        @for (row of rows(); track row.label) {
          <div class="flex items-baseline justify-between gap-4">
            <dt class="text-ink-subtle">{{ row.label }}</dt>
            <dd class="text-right">{{ row.value }}</dd>
          </div>
        } @empty {
          @if (loading()) {
            <ui-skeleton [lines]="3" />
          }
        }
        <div
          class="flex items-baseline justify-between gap-4 border-t
                 border-edge pt-3"
        >
          <dt class="text-ink-subtle">{{ text.subtotal }}</dt>
          <dd class="text-xl font-emphasis text-primary">{{ subtotal() }}</dd>
        </div>
      </dl>
      <p class="mt-1 text-right text-xs text-ink-subtle">
        {{ taxStatement() }}
      </p>

      @if (!complete()) {
        <ui-warning-note class="mt-2">
          {{ text.totalIncomplete }}
        </ui-warning-note>
      }
      @if (hasEstimate()) {
        <p class="mt-3 text-xs text-ink-subtle">
          {{ text.shipmentApproximate }}
        </p>
        @if (uncovered()) {
          <p class="mt-1 text-xs text-warning">{{ uncoveredMessage() }}</p>
        }
      }

      <div class="empty:hidden"><ng-content /></div>
    </div>
  `,
})
export class OrderSummary {
  private readonly boxUnits = inject(CATALOG_CONFIG).boxUnits;
  private readonly currency = moneyFormat(inject(DEPLOYMENT_CONFIG));

  protected readonly text = inject(SHARED_ORDERING_TEXT).orderSummary;
  private readonly tax = useTaxStatement();

  readonly lineCount = input.required<number>();
  readonly subtotalMinor = input.required<number>();
  readonly complete = input(true);
  /** Null before a line has ever been priced: there is nothing to add up yet. */
  readonly shipment = input<ShipmentSummary | null>(null);
  readonly loading = input(false);
  /** The lines' rates: named under the total while they agree
   * (NFR-LEGAL-11). */
  readonly taxRates = input<readonly (number | null)[]>([]);
  /** An order's own basis; a cart is quoted on the deployment's. */
  readonly taxBasis = input<TaxBasis | null>(null);

  protected readonly taxStatement = computed(() =>
    this.tax.total(this.taxRates(), this.taxBasis() ?? undefined),
  );

  protected readonly subtotal = computed(() =>
    formatMoneyMinor(this.subtotalMinor(), this.currency),
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

  /** The shipment estimate as rows that line up against a delivery note
   * (FR-UNIT-11). */
  protected readonly rows = computed<{ label: string; value: string }[]>(() => {
    const shipment = this.shipment();
    const rows: { label: string; value: string }[] = [];

    if (shipment && shipment.coveredLines > 0) {
      if (shipment.weight) {
        rows.push({
          label: this.text.shipmentWeight,
          value: `${formatStoredDecimal(shipment.weight, this.currency)} ${this.boxUnits.weight}`,
        });
      }
      if (shipment.volume) {
        rows.push({
          label: this.text.shipmentVolume,
          value: `${formatStoredDecimal(shipment.volume, this.currency)} ${this.boxUnits.volume}`,
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
