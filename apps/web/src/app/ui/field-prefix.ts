import { Directive } from '@angular/core';

/**
 * The fixed, unTypeable part shown flush against the left edge of a field — a
 * phone country code, a registration number's country prefix. Styled as part of
 * the control rather than as a label, because it *is* part of the value: what
 * gets stored is this plus what was typed.
 *
 *   <div class="flex">
 *     <span appFieldPrefix>+49</span>
 *     <input appInput class="w-full rounded-l-none" />
 *   </div>
 */
@Directive({
  selector: '[appFieldPrefix]',
  host: {
    class:
      'inline-flex items-center rounded-l-md border border-r-0 border-border-strong bg-stone-100 px-3 text-muted',
  },
})
export class FieldPrefix {}
