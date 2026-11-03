import { Component, input } from '@angular/core';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';

/** What an adjustment is about to change (FR-ORD-03), and nothing else: forty
 * lines with three moved is three rows. */
export interface OrderChange {
  /** In the order's own words. */
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
    <!-- Headed only as its own section: a fold's lid already names it. -->
    @if (heading()) {
      <h2 class="mb-2 font-medium">{{ heading() }}</h2>
    }
    <!-- Bars during the first pricing: neither "no change" nor an error is true
         yet. -->
    @if (loading()) {
      <ui-skeleton size="sm" [lines]="1" />
    } @else if (changes().length === 0 && !pending()) {
      <p class="text-sm text-ink-subtle">{{ empty() }}</p>
    } @else {
      <ul class="divide-y divide-edge border-t border-edge">
        @for (change of changes(); track $index) {
          <li class="py-2 last:pb-0 text-sm">
            <span class="block text-ink-subtle">{{ change.label }}</span>
            <!-- Old struck through, new beside it: colour never carries the
                 direction alone. -->
            @if (change.before) {
              <span class="text-danger line-through">{{ change.before }}</span>
            }
            @if (change.before && change.after) {
              <span class="px-1 text-ink-subtle" aria-hidden="true">→</span>
            }
            @if (change.after) {
              <span class="text-success">{{ change.after }}</span>
            }
          </li>
        }
        <!-- What cannot be compared yet, said within the list: the rest is
             still true, and "nothing changed" over a half-typed field is not
             believed twice. -->
        @if (pending(); as note) {
          <li class="py-2 text-sm text-ink-subtle">{{ note }}</li>
        }
      </ul>
    }
  `,
})
export class OrderAdjustChanges {
  readonly heading = input('');
  readonly empty = input.required<string>();
  readonly changes = input.required<readonly OrderChange[]>();
  readonly pending = input<string | null>(null);
  /** Never priced yet: no answer, not an empty one. */
  readonly loading = input(false);
}
