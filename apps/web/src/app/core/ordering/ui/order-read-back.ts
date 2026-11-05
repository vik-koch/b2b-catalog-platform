import { SHARED_ORDERING_TEXT } from '../ordering-text';
import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * An order read back: its lines, then one block per question it answers. The
 * same before sending and afterwards, for customer and staff.
 *
 * Takes resolved strings, not records: resolving an address or a party again
 * here could disagree with what the page sends or stored. Read-only, so not
 * the cart's row with its stepper and remove button.
 */
@Component({
  selector: 'app-order-read-back',
  imports: [RouterLink],
  host: { class: 'block' },
  template: `
    <div class="space-y-8">
      <section>
        <h2 class="mb-2 font-medium">{{ itemsHeading() || itemsDefault }}</h2>
        <ul class="divide-y divide-edge border-y border-edge">
          @for (line of lines(); track line.key) {
            <li class="flex items-baseline justify-between gap-4 py-2 text-sm">
              <span class="min-w-0">
                <!-- A line whose product is gone is plain words, not a link
                     into a 404. -->
                @if (line.href) {
                  <a class="block hover:text-accent" [routerLink]="line.href">
                    {{ line.name }}
                  </a>
                } @else {
                  <span class="block">{{ line.name }}</span>
                }
                <span class="text-ink-subtle">{{ line.quantity }}</span>
                @if (line.note) {
                  <span class="mt-0.5 block text-ink-subtle italic">
                    {{ line.note }}
                  </span>
                }
              </span>
              <span class="shrink-0 text-right">
                {{ line.total }}
                @if (line.taxRate) {
                  <span class="block text-xs text-ink-subtle">{{
                    line.taxRate
                  }}</span>
                }
              </span>
            </li>
          }
        </ul>
      </section>

      @for (block of blocks(); track block.heading) {
        <section>
          <h2 class="mb-2 font-medium">{{ block.heading }}</h2>
          @for (line of block.lines; track $index) {
            <!-- An email is one long word: unbroken, it widens the page on a
                 phone. -->
            <p
              class="text-sm wrap-break-word"
              [class.text-ink-subtle]="$index > 0"
            >
              {{ line }}
            </p>
          }
        </section>
      }
    </div>
  `,
})
export class OrderReadBack {
  protected readonly itemsDefault = inject(SHARED_ORDERING_TEXT).order.items;

  /** The lines' heading, where the page words it itself: admin text is a
   * separate file. */
  readonly itemsHeading = input('');

  readonly lines = input.required<readonly ReadBackLine[]>();
  readonly blocks = input.required<readonly ReviewBlock[]>();
}

/** One line as it is read back. */
export interface ReadBackLine {
  readonly key: string;
  readonly name: string;
  readonly quantity: string;
  readonly note: string | null;
  readonly total: string;
  /** Where the product can still be opened. */
  readonly href?: string | null;
  /** The line's tax rate, where the reader is shown one (NFR-LEGAL-11). */
  readonly taxRate?: string | null;
}

/** One answered question: the first line is the answer, the rest its
 * detail. */
export interface ReviewBlock {
  readonly heading: string;
  readonly lines: readonly string[];
}
