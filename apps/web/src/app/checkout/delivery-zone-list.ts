import { Component, inject } from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { formatPriceMinor } from '../catalog/price';
import { EmphasisedText } from '../ui/emphasised-text';

/**
 * The deployment's delivery zones, one card each (FR-CART-07) — drawn by the
 * checkout dialog and the conditions page alike, so the two cannot state a zone
 * differently.
 */
@Component({
  selector: 'app-delivery-zone-list',
  host: { class: 'block' },
  imports: [EmphasisedText],
  template: `
    <ul class="space-y-3">
      @for (zone of zones; track zone.key) {
        <li class="rounded-lg border border-border p-4">
          <p class="font-medium">{{ zone.title }}</p>
          @if (zone.description; as description) {
            <p class="mt-1 text-sm text-muted">
              <app-emphasised [text]="description" />
            </p>
          }
          <!-- Said out loud either way: a zone with no line under it would
               read as an unstated free threshold rather than none. -->
          <p class="mt-2 text-sm text-subtle">{{ terms(zone) }}</p>
        </li>
      }
    </ul>
  `,
})
export class DeliveryZoneList {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  protected readonly text = inject(APP_TEXT).checkout.fulfilment;
  protected readonly zones = this.config.delivery?.zones ?? [];

  protected terms(zone: {
    readonly delivers?: boolean;
    readonly freeFromMinor?: number;
  }): string {
    if (zone.delivers === false) return this.text.noDelivery;
    return zone.freeFromMinor === undefined
      ? this.text.noFreeDelivery
      : fillText(this.text.freeFrom, {
          amount: formatPriceMinor(zone.freeFromMinor, this.currency),
        });
  }
}
