import { Component, input } from '@angular/core';
import { Skeleton } from '../../ui/skeleton';

/**
 * What an adjustment is about to change (FR-ORD-03) — the whole of it, and
 * nothing else.
 *
 * A change list rather than a second copy of the order beside the first: an
 * order of forty lines with three of them moved is a screen where the answer
 * is three rows, and repeating the thirty-seven that did not move is a reading
 * exercise. What is on screen is what the manager is about to tell the
 * customer.
 */
export interface OrderChange {
  /** What moved, in the words the order itself uses. */
  label: string;
  /** Null where the thing is new, or gone. */
  before: string | null;
  after: string | null;
}

@Component({
  selector: 'app-order-adjust-changes',
  imports: [Skeleton],
  host: { class: 'block' },
  template: `
    <!-- Headed only where it is a section of its own. Inside a fold whose lid
         already names it, a heading is the same words twice. -->
    @if (heading()) {
      <h2 class="mb-2 font-medium">{{ heading() }}</h2>
    }
    <!-- Bars while the first pricing is in flight. Neither answer is true
         yet — nothing has changed *that anyone can see*, and nothing is wrong
         either — and the list said the second of them for as long as the
         round trip took. -->
    @if (loading()) {
      <app-skeleton [lines]="1" />
    } @else if (changes().length === 0 && !pending()) {
      <p class="text-sm text-subtle">{{ empty() }}</p>
    } @else {
      <ul class="divide-y divide-border border-t border-border">
        @for (change of changes(); track $index) {
          <li class="py-2 last:pb-0 text-sm">
            <span class="block text-subtle">{{ change.label }}</span>
            <!-- Old struck through, new beside it: the pair reads as one
                 sentence, and the colours are the only thing carrying the
                 direction, so neither side is left to them alone. -->
            @if (change.before) {
              <span class="text-red-700 line-through">{{ change.before }}</span>
            }
            @if (change.before && change.after) {
              <span class="px-1 text-subtle" aria-hidden="true">→</span>
            }
            @if (change.after) {
              <span class="text-green-800">{{ change.after }}</span>
            }
          </li>
        }
        <!-- The part of the comparison that cannot be made yet, said in the
             list rather than instead of it: the blocks that *can* be compared
             are still the truth about the draft, and a screen that answers
             "nothing has changed yet" because one field is half-typed is a
             screen nobody believes the second time. -->
        @if (pending(); as note) {
          <li class="py-2 text-sm text-subtle">{{ note }}</li>
        }
      </ul>
    }
  `,
})
export class OrderAdjustChanges {
  readonly heading = input('');
  readonly empty = input.required<string>();
  readonly changes = input.required<readonly OrderChange[]>();
  /** What is missing from the comparison, where something is. */
  readonly pending = input<string | null>(null);
  /** The draft has never been priced: not an answer, just not back yet. */
  readonly loading = input(false);
}
