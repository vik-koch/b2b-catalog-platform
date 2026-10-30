import { Component, computed, inject, input } from '@angular/core';
import { ProductAvailability } from '@b2b-catalog-platform/shared/core/catalog';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';

/** Green, amber, grey: an empty shelf is a fact, not a refusal. */
export const AVAILABILITY_TONES: Record<ProductAvailability, StatusTone> = {
  in: 'ok',
  low: 'waiting',
  out: 'neutral',
};

/**
 * Whether the product can be had (FR-STOCK-03), never how many; nothing where
 * stock is untracked. `reserve` holds the line open, so where some card in a
 * listing has a badge every name sits at one height.
 */
@Component({
  selector: 'app-product-availability-badge',
  imports: [StatusBadge],
  template: `
    @if (availability(); as state) {
      <span uiStatusBadge variant="dot" [tone]="tone()">{{ label() }}</span>
    } @else if (reserve()) {
      <!-- Held open by a space, so it tracks the pill's line box. -->
      <span aria-hidden="true" [class]="spacer">&nbsp;</span>
    }
  `,
  // Flex, not block: in a block the inline badge sits on the parent font's
  // line, four pixels of leading no margin takes back. Gone when empty, so a
  // caller's margin leaves no gap.
  host: {
    class: 'flex items-start',
    '[style.display]': "availability() || reserve() ? null : 'none'",
  },
})
export class ProductAvailabilityBadge {
  readonly availability = input.required<ProductAvailability | null>();
  readonly reserve = input(false);

  protected readonly tone = computed(
    () => AVAILABILITY_TONES[this.availability() ?? 'in'],
  );

  private readonly text = inject(SHARED_TEXT).product.availability;

  protected readonly label = computed(() => {
    const state = this.availability();
    return state === null ? '' : this.text[state];
  });

  /** The badge's own box, borders included, empty. */

  protected readonly spacer = `inline-flex items-center border
                               border-transparent px-2 py-0.5 text-xs
                               font-medium`;
}
