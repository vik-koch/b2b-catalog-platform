import { Directive } from '@angular/core';
import { Tickable } from './tickable';

/**
 * The native checkbox, painted ours. 16px in the 20px line of `text-sm`: a row
 * aligned to the first line of wrapping text adds `mt-0.5`, and the label
 * around it takes `cursor-pointer`. Both are layout, so both stay with the
 * caller.
 *
 *   <label class="flex cursor-pointer items-start gap-2 text-sm">
 *     <input type="checkbox" appCheckbox class="mt-0.5" />
 *     <span>…</span>
 *   </label>
 */
@Directive({
  selector: 'input[type="checkbox"][appCheckbox]',
  hostDirectives: [Tickable],
  host: { class: 'rounded-sm checked:bg-(image:--tick-mark)' },
})
export class Checkbox {}
