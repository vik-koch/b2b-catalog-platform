import { Directive } from '@angular/core';

/**
 * A control that belongs to a field's caption row rather than to the form,
 * such as a password's show/hide. Field draws it at the row's far end.
 *
 *   <app-field [field]="form.password" [label]="text.password">
 *     <button appFieldAction appTextButton type="button">Show</button>
 *     <input appInput [formField]="form.password" />
 *   </app-field>
 */
@Directive({ selector: '[appFieldAction]' })
export class FieldAction {}
