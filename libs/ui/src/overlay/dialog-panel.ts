import { computed, Directive, input } from '@angular/core';

const base = `m-auto max-h-[calc(100%-2rem)] overflow-y-auto rounded-lg border
              border-edge bg-surface-subtle p-6 text-ink shadow-xl
              backdrop:bg-ink/50`;

/**
 * Each width keeps a gutter from the viewport inside the size, not as a
 * margin, which would fight the top layer's centring.
 */
const widths = {
  /** A question and two answers. */
  md: 'w-[min(28rem,calc(100%-2rem))]',
  /** A short list to read. */
  lg: 'w-[min(32rem,calc(100%-2rem))]',
  /** Something with a picture in it. */
  xl: 'w-[min(42rem,calc(100%-2rem))]',
} as const;

/**
 * The look of a native <dialog> opened with showModal(), which owns the focus
 * trap, Escape and the backdrop. The width is an input, not a caller's class:
 * two widths on one element would be decided by stylesheet order.
 *
 *   <dialog appDialogPanel size="lg" #dialog (cancel)="…">…</dialog>
 */
@Directive({
  selector: '[appDialogPanel]',
  host: { '[class]': 'classes()' },
})
export class DialogPanel {
  readonly size = input<keyof typeof widths>('md');

  protected readonly classes = computed(() => `${base} ${widths[this.size()]}`);
}
