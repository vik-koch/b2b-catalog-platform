import { Component, computed, inject, input } from '@angular/core';
import { fillText, resolveDeliveryZone } from '@b2b-catalog-platform/shared';
import { CartService } from '../cart/cart.service';
import { formatPriceMinor } from '../catalog/price';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

/**
 * Which delivery area the entered address falls into, and whether this order
 * reaches the free-delivery minimum there (FR-CART-07).
 *
 * Advisory, and says so: no order is refused for missing a threshold and no
 * delivery is priced here. The zone is resolved in the browser only to *say*
 * it — the server re-derives it from the submitted address, because a
 * threshold a customer could pick for themselves would not be one.
 *
 * Silent until there is a postcode to resolve on — and empty rather than
 * blank, so the rule the page draws above it disappears with it. A hint that
 * appears the moment the field is focused, saying nothing, is noise.
 *
 * A zone may say the deployment does not deliver there at all. That is said
 * here, in amber, while the address is being typed: it is a cheaper
 * conversation before the order than after it. It still refuses nothing —
 * the order goes through and a manager answers it.
 */
@Component({
  selector: 'app-delivery-zone-hint',
  // Hidden while it has nothing to say, so whatever the page put on this
  // element — a rule above it — goes with it.
  host: { class: 'block empty:hidden' },
  template: `
    @if (zone(); as resolved) {
      <p class="text-sm text-muted">{{ resolved.title }}</p>
      @if (resolved.delivers) {
        @if (resolved.threshold) {
          <p class="text-sm text-muted">{{ resolved.threshold }}</p>
        }
      } @else {
        <p class="text-sm text-amber-700">{{ text.noDelivery }}</p>
      }
    } @else if (hasAddress()) {
      <p class="text-sm text-muted">{{ text.unknown }}</p>
    }
  `,
})
export class DeliveryZoneHint {
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;
  private readonly zones = this.config.delivery?.zones ?? [];
  private readonly cart = inject(CartService);

  protected readonly text = inject(APP_TEXT).checkout.zone;

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
      // the pair anyway, and reading it here would be a second opinion.
      threshold: delivers ? this.threshold(match.freeFromMinor) : null,
    };
  });

  /** What the order still needs to reach free delivery here, or that it
   * already has. Nothing at all where the zone quotes no minimum: there is no
   * threshold to be short of. */
  private threshold(freeFromMinor: number | undefined): string | null {
    if (freeFromMinor === undefined) return null;
    const total = this.cart.totalMinor();
    return total >= freeFromMinor
      ? this.text.qualifies
      : fillText(this.text.shortOf, {
          amount: formatPriceMinor(freeFromMinor - total, this.currency),
        });
  }
}
