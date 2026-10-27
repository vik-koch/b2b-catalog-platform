import { Directive } from '@angular/core';

/**
 * The fields of an edit-in-place form — the customer tier, the filterable
 * attribute, one row of the product's attributes on a narrow screen.
 *
 * A grid rather than a wrapping row of fixed widths: the fields were `w-56`,
 * `w-44`, `w-36` and `w-24`, which is four guesses at how long a deployment's
 * words are, and they wrapped into a ragged block the moment one of them was
 * wrong. Two equal columns from `sm` up, one below — so every field is either
 * half the form or all of it, and the three forms look like three of the same
 * thing.
 *
 * A field that wants the whole line says so with `sm:col-span-2`.
 */
@Directive({
  selector: '[appRecordFields]',
  host: { class: 'grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2' },
})
export class RecordFields {}
