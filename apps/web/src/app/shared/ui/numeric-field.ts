import { Directive, input } from '@angular/core';
import { refuseUnless } from './refuse-input';

/** The decimals a `decimal` field accepts. */
const DECIMAL_PLACES = 3;

const PARTIAL = {
  /** A count: digits only, so no separator, sign or exponent can be typed. */
  integer: /^\d*$/,
  /** The same with a leading minus, for a figure that can go below zero. */
  signed: /^-?\d*$/,
  /** A measurement. Either separator while typing, like a price field. */
  decimal: new RegExp(`^\\d*([.,]\\d{0,${DECIMAL_PLACES}})?$`),
} as const;

/**
 * Keeps a text field to a count, a signed count or a decimal. Text rather than
 * `type="number"`: a browser reports a half-typed "1." as empty, wiping the
 * bound value mid-keystroke, and the spinner edits on a scroll.
 */
@Directive({
  selector: 'input[appNumericField]',
  host: { '(beforeinput)': 'onBeforeInput($event)' },
})
export class NumericField {
  readonly appNumericField = input<'integer' | 'signed' | 'decimal'>('integer');

  protected onBeforeInput(event: InputEvent): void {
    refuseUnless(event, (next) => PARTIAL[this.appNumericField()].test(next));
  }
}
