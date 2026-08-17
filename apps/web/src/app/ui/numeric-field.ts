import { Directive, input } from '@angular/core';
import { refuseUnless } from './refuse-input';

/** How many decimals a `decimal` field accepts — the scale of the columns these
 * fields write to. */
const DECIMAL_PLACES = 3;

const PARTIAL = {
  /** A count: digits only, so no separator, sign or exponent can be typed. */
  integer: /^\d*$/,
  /** A measurement. Either separator while typing, like a price field. */
  decimal: new RegExp(`^\\d*([.,]\\d{0,${DECIMAL_PLACES}})?$`),
} as const;

/**
 * Keeps a number field to digits — a count, or a measurement with up to three
 * decimals. The sibling of `appPriceField`, which needs the deployment
 * currency's own precision and so cannot simply be this with a mode.
 *
 * Text rather than `type="number"` for the same reason prices are: a browser
 * reports a half-typed "1." as empty, wiping the bound value mid-keystroke. It
 * also hides the spinner and its scroll-wheel edits.
 */
@Directive({
  selector: 'input[appNumericField]',
  host: { '(beforeinput)': 'onBeforeInput($event)' },
})
export class NumericField {
  readonly appNumericField = input<'integer' | 'decimal'>('integer');

  protected onBeforeInput(event: InputEvent): void {
    refuseUnless(event, (next) => PARTIAL[this.appNumericField()].test(next));
  }
}
