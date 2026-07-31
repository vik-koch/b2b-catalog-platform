import { Directive } from '@angular/core';

/**
 * The caption above a form field — the text half of the `<label>` wrapper the
 * forms use, so it is a directive on the <span> rather than on the <label>
 * itself. Repeated in every editor and form in the app, which is the whole
 * reason it is here.
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
