import { Directive } from '@angular/core';

/**
 * The fixed part flush against a field's left edge, such as a country code.
 * Styled as part of the control, not as a label, because it is part of the
 * value: what is stored is this plus what was typed.
 *
 *   <div class="flex">
 *     <span appInputPrefix>+49</span>
 *     <input appInput class="w-full rounded-l-none" />
 *   </div>
 */
@Directive({
  selector: '[appInputPrefix]',
  host: {
    class: `inline-flex items-center rounded-l-md border border-r-0
            border-edge-strong bg-surface px-3 text-ink-subtle`,
  },
})
export class InputPrefix {}
