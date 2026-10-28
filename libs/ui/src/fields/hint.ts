import { Directive } from '@angular/core';

/**
 * What a field or a switch is for, said under it. One size on both sides of
 * the app: a hint is read before the field is filled, so it is never the
 * small print.
 *
 *   <p uiHint class="mt-1">{{ text.labelHint }}</p>
 */
@Directive({
  selector: '[uiHint]',
  host: { class: 'block text-sm text-ink-subtle' },
})
export class Hint {}
