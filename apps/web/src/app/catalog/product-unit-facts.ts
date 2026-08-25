import { Component, computed, inject, input } from '@angular/core';
import { ProductPackagingInfo } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { useProductUnits } from './product-units-view';

/**
 * The two facts that qualify a price without being part of it: the smallest
 * quantity the shop will sell, and how the pieces are packed. One component so
 * the grid tile and the product page's buying block state them identically —
 * a customer comparing a card against the page it links to is comparing the
 * same two lines, word for word.
 *
 * The minimum is always stated, down to "1 pcs": it answers the question the
 * line asks either way, and a line that comes and goes is worth more space than
 * the word "1". The packaging line has nothing to say for an unpackaged
 * product, and on a tile (`reserve`) it keeps its empty line so the controls
 * under it stay on one axis across the row.
 */
@Component({
  selector: 'app-product-unit-facts',
  host: { class: 'block' },
  template: `
    <p class="text-xs leading-snug text-subtle">{{ minimum() }}</p>
    @if (packaging(); as line) {
      <p class="text-xs leading-snug text-subtle">{{ line }}</p>
    }
  `,
})
export class ProductUnitFacts {
  readonly packagingInfo = input.required<ProductPackagingInfo>();
  /**
   * True on a grid tile: a fact the product does not have keeps its line as
   * blank space. A card that comes out a line shorter than its neighbour puts
   * its stepper and its button somewhere else, and a grid of controls at
   * different heights reads as broken.
   */
  readonly reserve = input(false);

  private readonly units = useProductUnits();
  private readonly text = inject(APP_TEXT).catalog.units;

  /** A non-breaking space, so an empty line still occupies one. */
  private readonly blank = '\u00a0';

  protected readonly minimum = computed(
    () =>
      `${this.text.minQuantity}: ${this.units.minimumOrder(this.packagingInfo())}`,
  );

  protected readonly packaging = computed(() =>
    this.line(
      this.text.packaging,
      this.units.packagingSummary(this.packagingInfo()),
    ),
  );

  private line(label: string, value: string | null): string | null {
    if (value !== null) return `${label}: ${value}`;
    return this.reserve() ? this.blank : null;
  }
}
