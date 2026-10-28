import { Directive } from '@angular/core';
import { Tickable } from './tickable';

/**
 * The native radio, Checkbox's twin in size and states. The dot is an inset
 * white ring over the checked fill, measured inward: a 14px inside less two
 * 2.25px rings leaves a 9.5px dot, so a thinner ring is a bigger dot.
 */
@Directive({
  selector: 'input[type="radio"][appRadio]',
  hostDirectives: [Tickable],
  host: { class: 'rounded-full checked:shadow-[inset_0_0_0_2.25px_#fff]' },
})
export class Radio {}
