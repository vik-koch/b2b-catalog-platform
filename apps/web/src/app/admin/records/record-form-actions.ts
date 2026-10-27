import { Directive } from '@angular/core';

/**
 * The save and cancel of an `appRecordFields` form, always on a line of their
 * own under the fields — never the fourth item of a wrapping field row, where
 * they landed in a different place on each of the three forms.
 */
@Directive({
  selector: '[appRecordFormActions]',
  host: { class: 'flex flex-wrap items-center gap-2 sm:col-span-2' },
})
export class RecordFormActions {}
