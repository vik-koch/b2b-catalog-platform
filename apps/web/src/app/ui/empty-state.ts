import { Component, input } from '@angular/core';
import { Icon, IconName } from './icons/icon';

/**
 * The panel a screen draws when there is nothing on it — an empty cart, an
 * account with no orders yet — and equally when something has just finished:
 * the order that was sent, which is the same shape of screen read the other way
 * round. One component for both, because the three of them were three
 * hand-written blocks that agreed about nothing: different paddings, headings
 * at different sizes, and buttons that touched on one and not on the next.
 *
 * The page keeps its own `h1`. What goes here is the *state* — a glyph for it,
 * a sentence, and whatever to do about it, which the caller projects so the
 * order and the variants of the buttons stay the page's decision.
 *
 * `tone` only picks the glyph's colour: an empty cart is a neutral fact, an
 * order that went through is a good outcome, and nothing else about the panel
 * changes between them.
 */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col items-center rounded-lg border border-border px-6 py-12 text-center"
    >
      <app-icon
        [name]="icon()"
        class="h-10 w-10"
        [class]="tone() === 'positive' ? 'text-primary' : 'text-subtle'"
      />
      @if (heading()) {
        <h2 class="mt-4 text-xl font-normal tracking-tight">
          {{ heading() }}
        </h2>
      }
      <p class="mt-2 max-w-md text-muted">{{ message() }}</p>

      <!-- The buttons the page projects, on one row with room between them
           and wrapping rather than shrinking. Stacked on a narrow screen,
           where two buttons side by side are two half-buttons. -->
      <div
        class="mt-6 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyState {
  readonly icon = input.required<IconName>();
  /** Optional: the page's own `h1` usually says it already. */
  readonly heading = input('');
  readonly message = input.required<string>();
  readonly tone = input<'neutral' | 'positive'>('neutral');
}
