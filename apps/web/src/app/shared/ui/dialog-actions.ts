import { Directive } from '@angular/core';

/**
 * The row of answers at the foot of a modal: cancel first, then the button
 * that does the thing, where the eye leaves the dialog.
 *
 * Narrow, the buttons share the width, so a long label wraps. Wide, the row
 * wraps, and a button may still shrink (`flex-initial`, not `flex-none`): one
 * wider than the row overflowed a `justify-end` line to the left, where
 * nothing can scroll to it.
 */
@Directive({
  selector: '[appDialogActions]',
  host: {
    class: `mt-6 flex flex-wrap gap-3
            sm:justify-end sm:[&>*]:flex-initial
            [&>*]:min-w-0 [&>*]:flex-1`,
  },
})
export class DialogActions {}
