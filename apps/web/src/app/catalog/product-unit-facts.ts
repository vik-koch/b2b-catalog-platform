import { Component, computed, inject, input } from '@angular/core';
import {
  ProductPackagingInfo,
  ProductUnit,
} from '@b2b-catalog-platform/shared';
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
 * the word "1". The packaging line simply has nothing to say for an unpackaged
 * product. Holding its space open where a missing line would push the controls
 * under it off their neighbours' axis is the caller's business — a min-height
 * on the block, which is layout, and which not every caller wants.
 */
@Component({
  selector: 'app-product-unit-facts',
  // On the host, so a caller reserving room for a line it may not have can
  // measure that room in lines of this text.
  host: { class: 'block text-xs leading-snug text-subtle' },
  template: `
    @if (shows('minimum')) {
      <p>{{ minimum() }}</p>
    }
    @if (shows('packaging')) {
      @if (packaging(); as line) {
        <p>{{ line }}</p>
      }
    }
  `,
})
export class ProductUnitFacts {
  readonly packagingInfo = input.required<ProductPackagingInfo>();
  /**
   * Which of the two facts to state. A row lays the block out across columns
   * rather than down the card — the minimum qualifies the quantity and goes
   * with the stepper, the packaging qualifies the price and goes with it — so
   * it asks for one line at a time.
   */
  readonly show = input<'both' | 'minimum' | 'packaging'>('both');
  /**
   * The unit the minimum is stated in. Defaults to pieces, which is how a tile
   * states it as a plain product fact; the buying controls pass the unit that
   * is actually selected, so the figure agrees with the stepper beside it.
   */
  readonly unit = input<ProductUnit>('piece');

  private readonly units = useProductUnits();
  private readonly text = inject(APP_TEXT).catalog.units;

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
    return summary === null ? null : `${this.text.packaging}: ${summary}`;
  });
}
