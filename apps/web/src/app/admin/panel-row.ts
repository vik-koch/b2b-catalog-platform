import { Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/**
 * One destination in a panel card: what it is on the left, and whatever is
 * worth saying about it on the right — the count waiting there, when the
 * import last ran, the switch that turns it on.
 *
 * A row rather than a button in a wrapped group, and that is the whole point:
 * the panel is a list of places to go, and a list of places reads down. Laid
 * out as buttons, each card's remark sat under whichever button it belonged
 * to, so half a dozen amber lines landed at half a dozen different heights and
 * none of them could be scanned for. As rows they share one right-hand axis
 * per card, and "what is waiting" is one column to read down instead of a
 * search.
 *
 * The whole row is the hit area — the link stretches over it with a
 * pseudo-element, the way the choice card's overlay does — and what sits on
 * the right is above that, so a work note stays its own link into its own
 * narrowed list.
 */
@Component({
  selector: 'app-panel-row',
  imports: [RouterLink],
  // A row in a card is an item in that card's list — the cards are named
  // lists, since several of these labels ("About us") also appear in the site
  // header and a screen reader moving through the page needs to tell one from
  // the other.
  host: { class: 'block', role: 'listitem' },
  template: `
    <!-- A floor rather than a fixed height: a row is 48px whatever it holds,
         so a label on its own and a label with two work notes beside it read
         as the same list. The padding is what a two-note stack needs to reach
         that height; anything shorter is centred against the floor. -->
    <div
      class="group/row relative flex min-h-12 items-center justify-between gap-4 px-5 py-1.75 transition-colors hover:bg-stone-100"
    >
      <a
        [routerLink]="link()"
        [queryParams]="queryParams()"
        class="after:absolute after:inset-0 group-hover/row:text-accent"
      >
        {{ label() }}
      </a>
      <!-- Positioned, so it paints over the link's overlay rather than under
           it: what is on the right is often a link of its own. A flex box, so
           what it holds centres against the row rather than sitting on the
           row's baseline. -->
      <div class="relative flex shrink-0 items-center"><ng-content /></div>
    </div>
  `,
})
export class PanelRow {
  readonly label = input.required<string>();
  readonly link = input.required<string | readonly unknown[]>();
  /** Where the row's own destination needs narrowing — not the note's, which
   * carries its own. */
  readonly queryParams = input<Params>();
}
