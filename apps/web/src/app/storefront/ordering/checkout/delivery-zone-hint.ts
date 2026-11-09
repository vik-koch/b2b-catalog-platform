import { Component, computed, inject, input } from '@angular/core';

import { resolveDeliveryZone } from '@b2b-catalog-platform/shared/core/ordering';
import {
  fillText,
  formatMoneyMinor,
  moneyFormat,
} from '@b2b-catalog-platform/shared/platform';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';

import { ORDERING_CONFIG } from '../../../core/ordering/ordering-config';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { CartService } from '../cart/cart.service';
import { STOREFRONT_ORDERING_TEXT } from '../ordering-text';

/** The delivery area of the typed address and whether the order reaches its
 * free-delivery minimum (FR-CART-07). Advisory: the server re-derives the zone,
 * and nothing is refused. Empty until there is a postcode. A zone the
 * deployment does not deliver to is said in amber while typing, still refusing
 * nothing. */
@Component({
  selector: 'app-delivery-zone-hint',
  imports: [WarningNote],
  // Hidden while empty, taking the page's rule above it along.
  host: { class: 'block empty:hidden' },
  template: `
    @if (zone(); as resolved) {
      <p class="text-sm text-ink-subtle">{{ resolved.title }}</p>
      @if (resolved.delivers) {
        @if (resolved.threshold) {
          <p class="text-sm text-ink-subtle">{{ resolved.threshold }}</p>
        }
      } @else {
        <ui-warning-note>{{ text.noDelivery }}</ui-warning-note>
      }
    } @else if (hasAddress()) {
      <p class="text-sm text-ink-subtle">{{ text.unknown }}</p>
    }
  `,
})
export class DeliveryZoneHint {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly orderingConfig = inject(ORDERING_CONFIG);
  private readonly currency = moneyFormat(this.config);
  private readonly zones = this.orderingConfig.delivery?.zones ?? [];
  private readonly cart = inject(CartService);

  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).checkout.zone;

  readonly postalCode = input<string>('');

  protected readonly hasAddress = computed(
    () => this.postalCode().trim().length > 0,
  );

  protected readonly zone = computed(() => {
    if (!this.hasAddress()) return null;
    const match = resolveDeliveryZone(this.zones, {
      postalCode: this.postalCode(),
    });
    if (!match) return null;

    const delivers = match.delivers !== false;
    return {
      title: fillText(this.text.resolved, { zone: match.title }),
      delivers,
      // Nothing to be short of where nothing is delivered; the config refuses
      // the pair anyway.
      threshold: delivers ? this.threshold(match.freeFromMinor) : null,
    };
  });

  /** What the order still needs for free delivery, or that it has it. Nothing
   * where the zone quotes no minimum. */
  private threshold(freeFromMinor: number | undefined): string | null {
    if (freeFromMinor === undefined) return null;
    const total = this.cart.totalMinor();
    return total >= freeFromMinor
      ? this.text.qualifies
      : fillText(this.text.shortOf, {
          amount: formatMoneyMinor(freeFromMinor - total, this.currency),
        });
  }
}
