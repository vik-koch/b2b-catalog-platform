import { Directive, input } from '@angular/core';
import { refuseUnless } from './refuse-input';

/**
 * Refuses a keystroke that would leave the text outside `rule`, which is asked
 * about the text part-way through typing. For decimals, use a text input:
 * `type="number"` reports a half-typed "18," as empty, and a bound value is
 * wiped mid-keystroke.
 *
 *   <input appInput type="text" inputmode="decimal" [appAllow]="isPartialTaxRate" />
 */
@Directive({
  selector: 'input[appAllow]',
  host: { '(beforeinput)': 'onBeforeInput($event)' },
})
export class Allow {
  readonly appAllow = input.required<(next: string) => boolean>();

  protected onBeforeInput(event: InputEvent): void {
    refuseUnless(event, this.appAllow());
  }
}
