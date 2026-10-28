import { Directive } from '@angular/core';
import { Tickable } from './tickable';

/**
 * The native checkbox, painted ours. In a row with its words, TickLabel.
 *
 *   <label uiTickLabel>
 *     <input type="checkbox" uiCheckbox />
 *     <span>…</span>
 *   </label>
 */
@Directive({
  selector: 'input[type="checkbox"][uiCheckbox]',
  hostDirectives: [Tickable],
  host: { class: 'rounded-sm checked:bg-(image:--tick-mark)' },
})
export class Checkbox {}
