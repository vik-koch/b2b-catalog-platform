import { Component, computed, input } from '@angular/core';
import {
  PRODUCT_PARTS_MIN,
  ProductAvailability,
} from '@b2b-catalog-platform/shared';
import { ProductAvailabilityBadge } from './product-availability-badge';
import { ProductSetBadge } from './product-set-badge';

/** What the line over a listed product's name is drawn from. */
export interface StatusLineProduct {
  availability: ProductAvailability | null;
  /** Absent for a shape that does not carry them — a cart line's. */
  parts?: readonly string[];
}

/**
 * Whether a listing should leave the line at all — true as soon as one product
 * in it has something to say there. Asked once per page rather than per card:
 * the answer is a property of the listing, and a card cannot see its
 * neighbours.
 */
export function anyStatus(items: readonly StatusLineProduct[]): boolean {
  return items.some((item) => item.availability !== null || isSet(item));
}

function isSet(item: StatusLineProduct): boolean {
  return (item.parts?.length ?? 0) >= PRODUCT_PARTS_MIN;
}

/**
 * The line over a listed product's name: whether it can be had (FR-STOCK-03),
 * then whether it is sold as a set (FR-CAT-10).
 *
 * `reserve` holds it open on a product with nothing to say, so every card's
 * name sits at one height. Both badges fit a card's 13.5rem in the wordings
 * shipped so far; a longer one wraps onto a second line rather than being cut,
 * since a cut word is worse than one name sitting a line lower than its
 * neighbours.
 */
@Component({
  selector: 'app-product-status-line',
  imports: [ProductAvailabilityBadge, ProductSetBadge],
  template: `
    <!-- The stock badge keeps the line open when nothing else does; the set
         badge holds it itself where it is there. -->
    <app-product-availability-badge
      class="shrink-0"
      [availability]="availability()"
      [reserve]="reserve() && !set()"
      [wrap]="stacked()"
    />
    @if (set()) {
      <app-product-set-badge [parts]="parts()" />
    }
  `,
  // Out of the flow entirely when it has nothing to render, so a margin the
  // caller set on it does not leave a gap under a plain, untracked product.
  host: {
    '[class]':
      "stacked() ? 'flex min-w-0 flex-col items-start gap-y-2' : 'flex min-w-0 flex-wrap items-start gap-x-1.5 gap-y-1'",
    '[style.display]': "availability() || set() || reserve() ? null : 'none'",
  },
})
export class ProductStatusLine {
  readonly availability = input.required<ProductAvailability | null>();
  readonly parts = input<readonly string[]>([]);
  readonly reserve = input(false);
  /**
   * One badge under the other in the column beside a thumbnail (the main
   * page's small card), where there is height to spare and little width: a
   * long stock label may break onto a second line, and the two sit further
   * apart than on a card's top edge.
   */
  readonly stacked = input(false);

  protected readonly set = computed(() =>
    isSet({ availability: null, parts: this.parts() }),
  );
}
