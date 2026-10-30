import { Component, computed, inject, input } from '@angular/core';
import {
  ProductPackaging,
  ProductUnit,
} from '@b2b-catalog-platform/shared/core/catalog';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { useProductUnits } from '../buying/product-units-view';

/**
 * The minimum order and the packaging, worded alike on a tile and the product
 * page. The minimum is always stated, down to "1 pcs"; holding the packaging
 * line's room where a product has none is the caller's layout.
 */
@Component({
  selector: 'app-product-unit-facts',
  // On the host, so a caller can reserve room in lines of this text.
  host: { class: 'block text-xs leading-snug text-ink-subtle' },
  template: `
    @if (shows('minimum')) {
      <p class="tracking-tight">{{ minimum() }}</p>
    }
    @if (shows('packaging')) {
      @if (packaging(); as line) {
        <p class="tracking-tight">{{ line }}</p>
      }
    }
  `,
})
export class ProductUnitFacts {
  readonly packagingInfo = input.required<ProductPackaging>();
  /** A row places them apart: the minimum by the stepper, the packaging by
   * the price. */
  readonly show = input<'both' | 'minimum' | 'packaging'>('both');
  /** The buy controls pass the selected one, as the stepper counts. */

  readonly unit = input<ProductUnit>('piece');

  private readonly units = useProductUnits();
  private readonly text = inject(STOREFRONT_TEXT).catalog.units;
  private readonly packing = inject(SHARED_TEXT).packaging;

  protected shows(fact: 'minimum' | 'packaging'): boolean {
    return this.show() === 'both' || this.show() === fact;
  }

  protected readonly minimum = computed(
    () =>
      `${this.text.minQuantity}: ${this.units.minimumOrder(
        this.packagingInfo(),
        this.unit(),
      )}`,
  );

  protected readonly packaging = computed(() => {
    const summary = this.units.packagingSummary(this.packagingInfo());
    return summary === null ? null : `${this.packing.heading}: ${summary}`;
  });
}
