import { ValidatorFn } from '@angular/forms';
import { digitsOf, maskLength } from '@b2b-catalog-platform/shared';

/**
 * A masked field must be filled to its full length: the deployment's mask says
 * how many digits it expects (see DigitMask), and half of them is the most
 * likely way to end up with an unreachable customer or an unmatchable company.
 *
 * Empty is left to `Validators.required`, so "you skipped this" and "this is
 * half typed" stay distinct messages — and so the rule can be applied to an
 * optional field, where being empty is fine but being partial is not.
 */
export const completeMask = (mask: string): ValidatorFn => {
  const expected = maskLength(mask);
  return (control) => {
    const entered = digitsOf(control.value);
    return !entered || entered.length === expected
      ? null
      : { incomplete: true };
  };
};
