import { computed, Directive, input } from '@angular/core';

const widths = {
  /** A question and two answers. */
  md: 'max-w-md',
  /** A short list to read — zones, offices. */
  lg: 'max-w-lg',
  /** Something with a picture in it. */
  xl: 'max-w-2xl',
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
      `m-auto ${widths[this.size()]} rounded-lg border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/50`,
  );
}
