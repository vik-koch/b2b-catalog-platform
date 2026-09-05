import { Directive } from '@angular/core';

/**
 * The row of answers at the foot of a modal: cancel first, then the button that
 * does the thing.
 *
 * That order is the platform's, not a preference — the confirming button sits
 * where the eye leaves the dialog, and every dialog in the app has to agree or
 * the muscle memory built on one of them misfires on the next.
 *
 * The buttons share the width equally until there is room for them not to.
 * Their labels are deployment text, and a translation twice the length of the
 * one this was designed against used to run out of the panel; splitting the
 * line between them lets the label wrap instead.
 *
 * Two rules keep the wide shape from doing the same. The row wraps, so a pair
 * of long labels takes two lines rather than one that does not fit. And the
 * buttons on it may shrink (`flex-initial`, not `flex-none`), so one label
 * longer than the whole panel wraps inside its button. Without the second, a
 * button wider than the row overflowed a `justify-end` line to the *left* —
 * the one direction nothing can scroll to, so the label was simply cut off.
 */
@Directive({
  selector: '[appDialogActions]',
  host: {
    class:
      'mt-6 flex flex-wrap gap-3 sm:justify-end [&>*]:min-w-0 [&>*]:flex-1 sm:[&>*]:flex-initial',
  },
})
export class DialogActions {}
