import { Directive } from '@angular/core';

/**
 * The caption above a form field, on the <span> inside a wrapping <label>
 * rather than on the label itself.
 *
 *   <label class="block">
 *     <span uiFieldLabel>{{ text.name }}</span>
 *     <input uiInput class="w-full" />
 *   </label>
 */
@Directive({
  selector: '[uiFieldLabel]',
  host: { class: 'mb-1 block text-sm font-medium' },
})
export class FieldLabel {}
