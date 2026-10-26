import { Directive } from '@angular/core';

/**
 * What a field or a switch is for, said under it. One size on both sides of
 * the app: a hint is read before the field is filled, so it is never the
 * small print.
 *
 *   <p appHint class="mt-1">{{ text.labelHint }}</p>
 */
@Directive({
  selector: '[appHint]',
  host: { class: 'block text-sm text-subtle' },
})
export class Hint {}
