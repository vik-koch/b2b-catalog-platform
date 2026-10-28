import { Directive } from '@angular/core';

/**
 * The caption above a form field, on the <span> inside a wrapping <label>
 * rather than on the label itself.
 *
 *   <label class="block">
 *     <span appFieldLabel>{{ text.name }}</span>
 *     <input appInput class="w-full" />
 *   </label>
 */
@Directive({
  selector: '[appFieldLabel]',
  host: { class: 'mb-1 block text-sm font-medium' },
})
export class FieldLabel {}
