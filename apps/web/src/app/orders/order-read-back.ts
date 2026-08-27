import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';

/**
 * An order read back: its lines, then one block per question it answers. Used
 * before it is sent (ADR 0039) and afterwards on the account's own order page,
 * so an order is described the same way whichever side of the send it is read
 * from.
 *
 * Everything is handed over already resolved — strings, not records. Which
 * address a picker settled on, and what a party is called, are the page's own
 * answers; working them out a second time here would be a second opinion that
 * can differ from the one being sent or the one that was stored.
 *
 * Read-only throughout, and deliberately not the cart's own row: those rows
 * carry a stepper, a unit selector and a remove button, which is the wrong
 * offer on a screen whose question is "is this right?".
 */
@Component({
  selector: 'app-order-read-back',
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <section>
        <h2 class="mb-2 font-medium">{{ itemsHeading() || text.items }}</h2>
        <ul class="divide-y divide-border border-y border-border">
          @for (line of lines(); track line.key) {
            <li class="flex items-baseline justify-between gap-4 py-2 text-sm">
              <span class="min-w-0">
                <!-- Linked only where there is still a product to open: a
                     line whose product is gone reads as plain words rather
                     than sending the customer into a 404. -->
                @if (line.href) {
                  <a class="block hover:text-accent" [routerLink]="line.href">
                    {{ line.name }}
                  </a>
                } @else {
                  <span class="block">{{ line.name }}</span>
                }
                <span class="text-subtle">{{ line.quantity }}</span>
                @if (line.note) {
                  <span class="mt-0.5 block text-subtle italic">
                    {{ line.note }}
                  </span>
                }
              </span>
              <span class="shrink-0 text-right">{{ line.total }}</span>
            </li>
          }
        </ul>
      </section>

      <!-- One block per question the form asked, in the order it asked them.
           A customer checking their answers is walking back down the same
           page. -->
      @for (block of blocks(); track block.heading) {
        <section>
          <h2 class="mb-2 font-medium">{{ block.heading }}</h2>
          @for (line of block.lines; track $index) {
            <p class="text-sm" [class.text-subtle]="$index > 0">{{ line }}</p>
          }
        </section>
      }
    </div>
  `,
})
export class OrderReadBack {
  protected readonly text = inject(APP_TEXT).checkout.review;

  /** The lines' heading, where the page has its own wording for it — the
   * admin's text is a separate catalogue from the shop's. */
  readonly itemsHeading = input('');

  /** The lines, already priced and worded by the page that holds them. */
  readonly lines = input.required<readonly ReadBackLine[]>();
  /** The answers, resolved by the page that collected or loaded them. */
  readonly blocks = input.required<readonly ReviewBlock[]>();
}

/** One line as it is read back: what it was, how much of it, what it cost. */
export interface ReadBackLine {
  readonly key: string;
  readonly name: string;
  readonly quantity: string;
  readonly note: string | null;
  readonly total: string;
  /** Where the product can still be opened, where it can. */
  readonly href?: string | null;
}

/** One answered question: its heading, then what was answered — the first line
 * is the answer itself, the rest are its detail. */
export interface ReviewBlock {
  readonly heading: string;
  readonly lines: readonly string[];
}
