import { Directive } from '@angular/core';

const base = `flex cursor-pointer items-start gap-2 text-sm
              has-[input:disabled]:cursor-not-allowed`;

/**
 * The label around a checkbox or radio and its words, the whole row a hit
 * area. Top-aligned for words that wrap; the box inside lines up with the
 * first line by itself.
 *
 *   <label appTickLabel>
 *     <input type="checkbox" appCheckbox />
 *     <span>…</span>
 *   </label>
 */
@Directive({
  selector: 'label[appTickLabel]',
  host: { class: base },
})
export class TickLabel {}
