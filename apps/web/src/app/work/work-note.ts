import { Component, input } from '@angular/core';
import { Params, RouterLink } from '@angular/router';

/**
 * One line of "this is waiting, and here is where you finish it" (FR-WORK-03)
 * — the panel's counterpart to the dot on the account control, and the only
 * place a figure is ever spelled out.
 *
 * Deliberately not a status badge. A badge states what something *is*; this
 * asks somebody to go and do something, so it is a link and reads as one:
 * the queue's own dot, the sentence, and an arrow that means "into the list".
 * Amber is the app's "somebody has to act" signal, the same one the marker
 * carries — the two are one thread from the navbar to the work.
 *
 * The link always lands on the section **narrowed to the very rows counted**,
 * so the figure and the list can never disagree.
 */
@Component({
  selector: 'app-work-note',
  imports: [RouterLink],
  template: `
    <a
      [routerLink]="link()"
      [queryParams]="queryParams()"
      class="group inline-flex items-center text-xs font-medium text-amber-800 hover:text-accent"
    >
      <span
        aria-hidden="true"
        class="size-1.5 shrink-0 rounded-full bg-amber-500 mr-2"
      ></span>
      <!-- The rule belongs under the words. On the anchor it also ran under
           the dot and the arrow, which made the arrow look struck through
           rather than moving. -->
      <span class="group-hover:underline pr-1">{{ label() }}</span>
      <!-- The arrow moves on hover, which is the whole of what says this is a
           way in rather than a note about the card. -->
      <span
        aria-hidden="true"
        class="transition-transform group-hover:translate-x-0.5"
        >&rarr;</span
      >
    </a>
  `,
  host: { class: 'block' },
})
export class WorkNote {
  /** The whole sentence, count already in it — the caller owns the wording. */
  readonly label = input.required<string>();
  readonly link = input.required<string | readonly unknown[]>();
  /** What narrows the destination to the rows this count is over. */
  readonly queryParams = input<Params>();
}
