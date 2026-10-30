import { Component, computed, input } from '@angular/core';
import {
  PRODUCT_PARTS_MIN,
  ProductAvailability,
  ProductImage,
  ProductVariant,
} from '@b2b-catalog-platform/shared/core/catalog';
import { ProductAvailabilityBadge } from '../../../core/catalog/buying/product-availability-badge';
import { ProductSetBadge } from '../../../core/catalog/buying/product-set-badge';
import { ProductVariantsMark } from './product-variants-mark';

export interface StatusLineProduct {
  availability: ProductAvailability | null;
  /** Absent on a cart line. */
  parts?: readonly string[];
}

/** Asked once per listing: a card cannot see its neighbours. */
export function anyStatus(items: readonly StatusLineProduct[]): boolean {
  return items.some((item) => item.availability !== null || isSet(item));
}

function isSet(item: StatusLineProduct): boolean {
  return (item.parts?.length ?? 0) >= PRODUCT_PARTS_MIN;
}

/**
 * The line over a listed product's name: stock (FR-STOCK-03), set (FR-CAT-10)
 * and, on a row, the variants mark (FR-CAT-13); a card's pictures name their
 * variants themselves. `reserve` holds the line open so names sit level. A
 * long badge wraps rather than being cut.
 */
@Component({
  selector: 'app-product-status-line',
  imports: [ProductAvailabilityBadge, ProductSetBadge, ProductVariantsMark],
  template: `
    <app-product-availability-badge
      class="shrink-0"
      [availability]="availability()"
      [reserve]="reserve() && !set()"
    />
    @if (set()) {
      <app-product-set-badge [parts]="parts()" />
    }
    @if (variants().length) {
      <app-product-variants-mark
        [variants]="variants()"
        [images]="images()"
        [productName]="productName()"
      />
    }
  `,
  // Out of the flow when empty, so the caller's margin leaves no gap.
  host: {
    class: 'flex min-w-0 flex-wrap items-start gap-0.5',
    '[style.display]':
      "availability() || set() || variants().length || reserve() ? null : 'none'",
  },
})
export class ProductStatusLine {
  readonly availability = input.required<ProductAvailability | null>();
  readonly parts = input<readonly string[]>([]);
  readonly reserve = input(false);
  readonly variants = input<readonly ProductVariant[]>([]);
  readonly images = input<readonly ProductImage[]>([]);
  readonly productName = input('');

  protected readonly set = computed(() =>
    isSet({ availability: null, parts: this.parts() }),
  );
}
