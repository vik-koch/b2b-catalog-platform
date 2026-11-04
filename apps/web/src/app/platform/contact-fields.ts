import { Provider } from '@angular/core';
import { DIGIT_MASK_FORMAT } from '@b2b-catalog-platform/ui/inputs/digit-mask-format';

/** A phone number stored whole and entered as a shown prefix and a masked
 * body, in both directions. The rules live in shared, which the API reads too;
 * re-exported so a form has one door. Its checks are in `field-rules.ts`. */
export {
  canonicalPhone,
  formatPhone,
  typedPhone,
} from '@b2b-catalog-platform/shared/platform';
import {
  applyMask,
  stripDialPrefix,
} from '@b2b-catalog-platform/shared/platform';

/** The masks' grouping rule for DigitMask, the one the API formats with. */
export function provideDigitMaskFormat(): Provider {
  return {
    provide: DIGIT_MASK_FORMAT,
    useValue: { apply: applyMask, stripPrefix: stripDialPrefix },
  };
}
