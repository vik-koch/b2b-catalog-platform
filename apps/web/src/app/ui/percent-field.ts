import { Directive } from '@angular/core';
import { isPartialTaxRate } from '@b2b-catalog-platform/shared';
import { refuseUnless } from './refuse-input';

/**
 * Keeps a percent field to what a tax rate can look like: 0 to 100, with
 * either separator and at most two decimals. The sibling of `appPriceField`,
 * and text rather than `type="number"` for the same reason — a browser
 * reports a half-typed "5," as empty, wiping the bound value mid-keystroke.
 */
@Directive({
  selector: 'input[appPercentField]',
  host: {
    inputmode: 'decimal',
    '(beforeinput)': 'onBeforeInput($event)',
  },
})
export class PercentField {
  protected onBeforeInput(event: InputEvent): void {
    refuseUnless(event, isPartialTaxRate);
  }
}
