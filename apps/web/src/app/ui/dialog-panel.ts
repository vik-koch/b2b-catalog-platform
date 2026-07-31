import { Directive } from '@angular/core';

/**
 * The modal surface itself: applied to a native <dialog> opened with
 * showModal(), so the browser owns the focus trap, Esc handling and backdrop
 * and this only supplies the look. `m-auto` centres it against the top layer's
 * viewport-sized box.
 *
 *   <dialog appDialogPanel #dialog (cancel)="…">…</dialog>
 */
@Directive({
  selector: '[appDialogPanel]',
  host: {
    class:
      'm-auto max-w-md rounded-lg border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/50',
  },
})
export class DialogPanel {}
