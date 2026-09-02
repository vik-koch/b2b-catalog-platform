import { computed, Directive, input } from '@angular/core';

/**
 * Every width is capped against the viewport as well: a modal is centred by
 * `m-auto`, which on a phone narrower than the panel leaves it flush against
 * both edges. The gutter is part of the size rather than a margin, because a
 * <dialog> in the top layer is laid out against the viewport box and a margin
 * would fight the centring.
 */
const widths = {
  /** A question and two answers. */
  md: 'w-[min(28rem,calc(100%-2rem))]',
  /** A short list to read — zones, offices. */
  lg: 'w-[min(32rem,calc(100%-2rem))]',
  /** Something with a picture in it. */
  xl: 'w-[min(42rem,calc(100%-2rem))]',
} as const;

/**
 * The modal surface itself: applied to a native <dialog> opened with
 * showModal(), so the browser owns the focus trap, Esc handling and backdrop
 * and this only supplies the look. `m-auto` centres it against the top layer's
 * viewport-sized box.
 *
 *   <dialog appDialogPanel size="lg" #dialog (cancel)="…">…</dialog>
 *
 * The width is an input rather than a class on the call site: two `max-w-*`
 * utilities on one element would be decided by stylesheet order.
 */
@Directive({
  selector: '[appDialogPanel]',
  host: { '[class]': 'classes()' },
})
export class DialogPanel {
  readonly size = input<keyof typeof widths>('md');

  protected readonly classes = computed(
    () =>
      `m-auto ${widths[this.size()]} max-h-[calc(100%-2rem)] overflow-y-auto rounded-lg border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/50`,
  );
}
