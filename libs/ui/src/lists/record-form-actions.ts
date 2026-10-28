import { Directive } from '@angular/core';

/** The save and cancel of an `uiRecordFields` form, on a line of their own. */
@Directive({
  selector: '[uiRecordFormActions]',
  host: { class: 'flex flex-wrap items-center gap-2 sm:col-span-2' },
})
export class RecordFormActions {}
