import { Directive } from '@angular/core';

/** The save and cancel of an `appRecordFields` form, on a line of their own. */
@Directive({
  selector: '[appRecordFormActions]',
  host: { class: 'flex flex-wrap items-center gap-2 sm:col-span-2' },
})
export class RecordFormActions {}
