import { Component, inject, input } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { fillText } from '@b2b-catalog-platform/shared';
import { PairingsService } from './pairings.service';

/**
 * The sold-together marker (FR-SET-05) — the one place a customer meets a
 * pairing on the storefront, wherever a product is drawn. What it opens is
 * ProductPairingsDialog, which the shell draws; this only says which product.
 *
 * Two shapes of the same control, because it competes for two kinds of room:
 *
 * - **`marker`**, a glyph in the price row beside the note's bubble, which is
 *   all a grid tile or a listing line can spare. Marked colour permanently: a
 *   product either has counterparts or has no marker at all, so there is no
 *   unmarked state for grey to mean.
 * - **`link`**, the glyph with the word beside it, where there is a line to
 *   spare — the product page's buying block, and the cart's line.
 */
@Component({
  selector: 'app-product-pairings',
  imports: [Icon, IconButton],
  template: `
    @if (variant() === 'marker') {
      <button
        type="button"
        appIconButton
        variant="marked"
        [attr.aria-label]="label()"
        [title]="label()"
        (click)="open()"
      >
        <app-icon name="package-plus" />
      </button>
    } @else {
      <!-- The glyph and the word, sized like the facts around it: on a product
           page it stands under the packaging line and in the cart it stands
           over the note, and in both it is one more thing the line says about
           itself rather than a button competing with the one that buys. -->
      <button
        type="button"
        class="inline-flex cursor-pointer items-center gap-1.5 self-start text-sm text-accent hover:underline"
        (click)="open()"
      >
        <app-icon name="package-plus" class="h-4 w-4" />
        {{ text.label }}
      </button>
    }
  `,
})
export class ProductPairings {
  protected readonly text = inject(APP_TEXT).catalog.pairings;
  private readonly pairings = inject(PairingsService);

  readonly slug = input.required<string>();
  /** How many counterparts the product has, as the tile already knows it —
   * what the marker says before anything is fetched. */
  readonly count = input.required<number>();
  readonly variant = input<'marker' | 'link'>('marker');

  protected readonly label = () =>
    fillText(this.text.marker, { count: this.count() });

  protected open(): void {
    this.pairings.show(this.slug(), this.count());
  }
}
