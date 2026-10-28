import { Directive } from '@angular/core';

/**
 * A control that belongs to a field's caption row rather than to the form,
 * such as a password's show/hide. Field draws it at the row's far end.
 *
 *   <ui-field [field]="form.password" [label]="text.password">
 *     <button uiFieldAction uiTextButton type="button">Show</button>
 *     <input uiInput [formField]="form.password" />
 *   </ui-field>
 */
@Directive({ selector: '[uiFieldAction]' })
export class FieldAction {}
