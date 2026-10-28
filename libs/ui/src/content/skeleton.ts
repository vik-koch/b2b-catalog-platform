import { Component, computed, input } from '@angular/core';

/** Widths cycle so a block of bars reads as text rather than as a table. */
const WIDTHS = ['100%', '83%', '66%'] as const;

/**
 * What the bars stand in for. `block` is a region of unknown content: bars
 * with air between them. The text sizes stand in for lines of actual text: the
 * row is the line box that text would occupy and the bar is thinner inside it,
 * so what arrives lands exactly where the bar was and nothing under it moves.
 * `title` is a page title's line.
 */
export type SkeletonSize = 'block' | 'sm' | 'base' | 'title';

const row = 'flex items-center';

/** The line box each size fills, and the bar drawn inside it. */
const rowHeights: Record<SkeletonSize, string> = {
  block: 'h-4',
  sm: 'h-5',
  base: 'h-6',
  title: 'h-9',
};

/** The edge the replaced text is set against. */
const aligns = {
  left: '',
  right: 'justify-end',
} as const;

const bar = 'rounded-sm bg-skeleton';

const barHeights: Record<SkeletonSize, string> = {
  block: 'h-4',
  sm: 'h-3',
  base: 'h-3.5',
  title: 'h-7',
};

/**
 * Placeholder bars for content that has not arrived. Hidden from assistive
 * technology: the cue there is the live region or the heading already on the
 * page. Show it after a short delay, so a quick load never flashes it.
 *
 *   @if (showSkeleton()) {
 *     <ui-skeleton [lines]="4" />
 *   }
 *
 * Standing in for a known line of text, give it that text's size, and its
 * width, where the answer is a figure rather than a sentence:
 *
 *   <ui-skeleton size="sm" align="right" [widths]="['3rem']" />
 */
@Component({
  selector: 'ui-skeleton',
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
      <div [class]="rowClass()">
        <div [class]="barClass()" [style.width]="width"></div>
      </div>
    }
  `,
})
export class Skeleton {
  readonly lines = input(3);
  readonly size = input<SkeletonSize>('block');
  readonly align = input<keyof typeof aligns>('left');
  /**
   * Bar widths, one per line, where the content has a width worth imitating.
   * Its length wins over `lines`.
   */
  readonly widths = input<readonly string[] | null>(null);

  protected readonly bars = computed(
    () =>
      this.widths() ??
      Array.from({ length: this.lines() }, (_, i) => WIDTHS[i % WIDTHS.length]),
  );
  protected readonly rowClass = computed(
    () => `${row} ${rowHeights[this.size()]} ${aligns[this.align()]}`,
  );
  protected readonly barClass = computed(
    () => `${bar} ${barHeights[this.size()]}`,
  );
}
