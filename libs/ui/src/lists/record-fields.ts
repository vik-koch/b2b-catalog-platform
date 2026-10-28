import { Directive } from '@angular/core';

/**
 * The fields of an edit-in-place record form: two equal columns from `sm` up,
 * one below, so no field width guesses at a deployment's words. A field
 * wanting the whole line takes `sm:col-span-2`.
 */
@Directive({
  selector: '[uiRecordFields]',
  host: { class: 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2' },
})
export class RecordFields {}
