import { Component, computed, inject, input } from '@angular/core';
import { ProductAvailability } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { StatusBadge, StatusTone } from '../ui/status-badge';

/**
 * Whether the product can be had, wherever its buying controls are
 * (FR-STOCK-03) — the card, the line and the product page. The quantity behind
 * it is never here: the state is the whole of what a customer is told.
 *
 * Renders nothing for a product whose stock is untracked, which is the default
 * and the state a deployment that never enters a figure stays in.
 *
 * `reserve` is what keeps a grid straight: a listing where *some* product has a
 * badge leaves the line for all of them, so every card's name sits at the same
 * height. A listing where none does leaves nothing.
 */
/**
 * Whether a listing should leave the line at all — true as soon as one product
 * in it has a state. Asked once per page rather than per card: the answer is a
 * property of the listing, and a card cannot see its neighbours.
 */
export function anyAvailability(
  items: readonly { availability: ProductAvailability | null }[],
): boolean {
  return items.some((item) => item.availability !== null);
}

@Component({
  selector: 'app-product-availability-badge',
  imports: [StatusBadge],
  template: `
    @if (availability(); as state) {
      <span appStatusBadge variant="dot" [tone]="tone()">{{ label() }}</span>
    } @else if (reserve()) {
      <!-- The badge's own height, held open by a space rather than a fixed
           figure, so it tracks the pill's line box if that ever changes. -->
      <span aria-hidden="true" [class]="spacer">&nbsp;</span>
    }
  `,
  // A flex container rather than a block: the badge is an inline box, and in a
  // block it sits on a line whose height is the *parent's* font — four pixels
  // of leading above a 22px pill that no margin here could take back.
  //
  // Out of the flow entirely when it has nothing to render, so a margin the
  // caller set on it does not leave a gap under an untracked product.
  host: {
    class: 'flex items-start',
    '[style.display]': "availability() || reserve() ? null : 'none'",
  },
})
export class ProductAvailabilityBadge {
  readonly availability = input.required<ProductAvailability | null>();
  readonly reserve = input(false);

  /** Green for what is there, amber for what is nearly gone, and a plain grey
   * for what is not — an empty shelf is a fact, not a refusal. */
  protected readonly tone = computed<StatusTone>(() => {
    const tones: Record<ProductAvailability, StatusTone> = {
      in: 'ok',
      low: 'waiting',
      out: 'neutral',
    };
    return tones[this.availability() ?? 'in'];
  });

  private readonly text = inject(APP_TEXT).catalog.availability;

  protected readonly label = computed(() => {
    const state = this.availability();
    return state === null ? '' : this.text[state];
  });

  // The badge's own box, borders included, with nothing in it.
  protected readonly spacer =
    'inline-flex items-center border border-transparent px-2 py-0.5 text-xs font-medium';
}
