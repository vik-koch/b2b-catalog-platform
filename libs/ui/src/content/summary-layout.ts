import { Component, computed, input } from '@angular/core';

/** The main column's track once the summary stands beside it. */
const tracks = {
  /** A reading measure, the slack between the columns. */
  measure: '@min-[63.75rem]/summary:grid-cols-[36rem_20rem]',
  /** Whatever the summary leaves. */
  fill: '@min-[63.75rem]/summary:grid-cols-[1fr_20rem]',
} as const;

/**
 * A page and the summary card it is read against: stacked, then side by side
 * once the page is wide enough, with the card pinned under the header. Every
 * screen that uses it folds at the same width, so the card sits in one place
 * across them. Measured on the page rather than the window: the frame's
 * padding and the scrollbar are invisible to a media query.
 *
 *   <ui-summary-layout track="fill">
 *     <div>…</div>
 *     <aside summary>…</aside>
 *   </ui-summary-layout>
 */
@Component({
  selector: 'ui-summary-layout',
  host: { class: 'block @container/summary' },
  template: `
    <div [class]="gridClass()">
      <div class="min-w-0"><ng-content /></div>
      <!-- Capped while stacked, and only as tall as its content beside the
           page, or a stretched column has nowhere to travel. -->
      <div
        class="max-w-xl
               @min-[63.75rem]/summary:visible @min-[63.75rem]/summary:sticky
               @min-[63.75rem]/summary:top-20 @min-[63.75rem]/summary:mt-9
               @min-[63.75rem]/summary:self-start"
        [class.invisible]="holdWhileStacked()"
      >
        <ng-content select="[summary]" />
      </div>
    </div>
  `,
})
export class SummaryLayout {
  readonly track = input<keyof typeof tracks>('measure');
  /** Hides the stacked card while the page above it is still arriving, or it
   * is drawn under the heading and pushed down. Beside the page it waits for
   * nothing. */
  readonly holdWhileStacked = input(false);

  protected readonly gridClass = computed(
    () => `grid gap-10 ${tracks[this.track()]}
           @min-[63.75rem]/summary:justify-between`,
  );
}
