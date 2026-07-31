import { Component, computed, input } from '@angular/core';

/** Widths cycle so a block of bars reads as text rather than as a table. */
const WIDTHS = ['100%', '83%', '66%'] as const;

/**
 * Placeholder bars for a region whose content has not arrived yet. Purely
 * decorative — `aria-hidden`, because the screen reader's cue is the live
 * region or the heading that is already on the page, not a row of grey boxes.
 *
 * Pair it with `delayedLoading` so it never appears for a load that was quick
 * enough not to need it.
 *
 *   @if (showSkeleton()) {
 *     <app-skeleton [lines]="4" />
 *   }
 */
@Component({
  selector: 'app-skeleton',
  host: { class: 'block animate-pulse space-y-3', 'aria-hidden': 'true' },
  template: `
    @for (width of widths(); track $index) {
      <div class="h-4 rounded bg-stone-200" [style.width]="width"></div>
    }
  `,
})
export class Skeleton {
  readonly lines = input(3);

  protected readonly widths = computed(() =>
    Array.from({ length: this.lines() }, (_, i) => WIDTHS[i % WIDTHS.length]),
  );
}
