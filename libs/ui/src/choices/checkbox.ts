import { Directive } from '@angular/core';
import { Tickable } from './tickable';

/**
 * The native checkbox, painted ours. In a row with its words, TickLabel.
 *
 *   <label appTickLabel>
 *     <input type="checkbox" appCheckbox />
 *     <span>…</span>
 *   </label>
 */
@Directive({
  selector: 'input[type="checkbox"][appCheckbox]',
  hostDirectives: [Tickable],
  host: { class: 'rounded-sm checked:bg-(image:--tick-mark)' },
})
export class Checkbox {}
