import { Component, computed, input } from '@angular/core';

/** Widths cycle so a block of bars reads as text rather than as a table. */
const WIDTHS = ['100%', '83%', '66%'] as const;

/**
 * What the bars stand in for. `block` is a region of unknown content — bars
 * with air between them. The text sizes stand in for lines of actual text: the
 * row is the line box that text would occupy and the bar is thinner inside it,
 * so what arrives lands exactly where the bar was and nothing under it moves.
 */
export type SkeletonSize = 'block' | 'sm' | 'base';

/** The line box each size fills, and the bar drawn inside it. */
const ROWS: Record<SkeletonSize, string> = {
  block: 'h-4',
  sm: 'h-5',
  base: 'h-6',
};
const BARS: Record<SkeletonSize, string> = {
  block: 'h-4',
  sm: 'h-3',
  base: 'h-3.5',
};

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
 *
 * Standing in for a known line of text, give it that text's size — and its
 * width, where the answer is a figure rather than a sentence:
 *
 *   <app-skeleton size="sm" align="right" [widths]="['3rem']" />
 */
@Component({
  selector: 'app-skeleton',
  host: {
    class: 'block animate-pulse',
    'aria-hidden': 'true',
    // Air between bars only where they stand for a region. Lines of text are
    // already spaced by their line boxes; a gap on top of that would put the
    // arriving text somewhere the bars never were.
    '[class.space-y-3]': "size() === 'block'",
  },
  template: `
    @for (width of bars(); track $index) {
      <div class="flex items-center" [class]="row()">
        <div
          class="rounded bg-stone-200"
          [class]="bar()"
          [style.width]="width"
        ></div>
      </div>
    }
  `,
})
export class Skeleton {
  readonly lines = input(3);
  readonly size = input<SkeletonSize>('block');
  /** Which edge the bars hang from — the edge the text they replace is set
   * against. */
  readonly align = input<'left' | 'right'>('left');
  /** Bar widths, one per line, where the content has a width worth imitating.
   * Its length wins over `lines`. */
  readonly widths = input<readonly string[] | null>(null);

  protected readonly bars = computed(
    () =>
      this.widths() ??
      Array.from({ length: this.lines() }, (_, i) => WIDTHS[i % WIDTHS.length]),
  );
  protected readonly row = computed(
    () =>
      `${ROWS[this.size()]} ${this.align() === 'right' ? 'justify-end' : ''}`,
  );
  protected readonly bar = computed(() => BARS[this.size()]);
}
