import { Component, computed, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { Glyph } from '../icons/glyph';

const glyph = 'size-10';

/** `tone` only colours the glyph. */
const glyphTones = {
  neutral: 'text-ink-subtle',
  positive: 'text-primary',
} as const;

/**
 * The panel a screen draws when there is nothing on it, and equally when
 * something has just finished: the same shape read the other way round. The
 * page keeps its own `h1`; this holds the state, a glyph and a sentence, and
 * the caller projects what to do about it.
 */
@Component({
  selector: 'ui-empty-state',
  imports: [Icon],
  host: { class: 'block' },
  template: `
    <div
      class="flex flex-col items-center rounded-lg border border-edge px-6
             py-12 text-center"
    >
      <ui-icon [glyph]="icon()" [class]="glyphClass()" />
      @if (heading()) {
        <h2 class="mt-4 text-xl font-normal tracking-tight">
          {{ heading() }}
        </h2>
      }
      <p class="mt-2 max-w-md text-ink-subtle">{{ message() }}</p>

      <!-- Stacked on a narrow screen, where two buttons side by side are two
           half-buttons. -->
      <div
        class="mt-6 flex w-full flex-col items-stretch gap-3
               sm:w-auto sm:flex-row sm:items-center"
      >
        <ng-content />
      </div>
    </div>
  `,
})
export class EmptyState {
  readonly icon = input.required<Glyph>();
  /** Optional: the page's own `h1` usually says it already. */
  readonly heading = input('');
  readonly message = input.required<string>();
  readonly tone = input<keyof typeof glyphTones>('neutral');

  protected readonly glyphClass = computed(
    () => `${glyph} ${glyphTones[this.tone()]}`,
  );
}
