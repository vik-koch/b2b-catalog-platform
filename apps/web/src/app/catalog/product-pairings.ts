import { Component, computed, inject, input } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { IconButton } from '../ui/icon-button';
import { Icon } from '../ui/icons/icon';
import { fillText } from '@b2b-catalog-platform/shared';
import { LINK_BASE, LINK_TONES } from '../ui/link';
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
 *   spare — the product page's buying block, and the cart's line. The word is
 *   styled as a link, because that is what it does. Given `message`, the link
 *   is only the first half of a sentence and the rest of it follows in plain
 *   text: what a cart line is short of, said and answered in one line.
 */
@Component({
  selector: 'app-product-pairings',
  imports: [Icon, IconButton],
  // Not inline: an inline host puts its contents on a text baseline and keeps
  // a descender's worth of room under them, which is what made this two pixels
  // taller than the note button beside it and left it hanging in the cart.
  host: { class: 'flex' },
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
      <p [class]="lineClass()">
        <!-- Nudged to the first line's optical middle rather than centred on
             the whole line: the shortfall wraps to two lines in a narrow
             column, and a glyph centred on that sits beside neither. -->
        <app-icon name="package-plus" class="mt-0.5 h-4 w-4 shrink-0" />
        <!-- One flex item for the whole sentence, so the words wrap as words:
             the link and what follows it in two items broke between them
             first, leaving "Add 20 pc" alone on a line. Written tight and left
             that way, because whitespace around an interpolation survives as a
             space — and a space inside the link is a space underlined. The one
             between the two halves is an explicit ngsp entity, which is the
             whitespace the compiler keeps. -->
        <!-- prettier-ignore -->
        <span><button type="button" [class]="linkClass()" (click)="open()">{{ message()?.link ?? text.label }}</button>@if (message(); as said) {&ngsp;{{ said.rest }}}</span>
      </p>
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
  /**
   * The `link` variant saying something other than its own name: the link's
   * words, and the rest of the sentence they open. Turns the whole line amber,
   * because what it is saying is a shortfall rather than an offer.
   */
  readonly message = input<{ link: string; rest: string } | null>(null);

  protected readonly lineClass = computed(
    () =>
      `flex items-start gap-1.5 self-start text-sm ${
        this.message() ? 'text-amber-700' : 'text-primary'
      }`,
  );
  protected readonly linkClass = computed(
    () =>
      `${LINK_BASE} text-left ${
        this.message() ? LINK_TONES.warning : LINK_TONES.default
      }`,
  );

  protected readonly label = () =>
    fillText(this.text.marker, { count: this.count() });

  protected open(): void {
    this.pairings.show(this.slug(), this.count());
  }
}
