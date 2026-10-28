import { Provider } from '@angular/core';
import { applyMask, stripDialPrefix } from '@b2b-catalog-platform/shared';
import { DIGIT_MASK_FORMAT } from '../ui/digit-mask-format';

/**
 * A phone number in both directions. It is stored in one canonical form
 * (`+49401234501`) while being *entered* in two parts: a fixed prefix the form
 * displays and the visitor never types, and a masked body. Registration
 * composes those into the stored value; the staff editor takes a stored value
 * apart again to seed the same fields. Keeping both directions together is
 * what stops the two screens disagreeing about where the prefix ends.
 *
 * The functions live in `@b2b-catalog-platform/shared` — the API formats
 * numbers for staff notifications and needs the same rule — and are
 * re-exported here so a form has one door to knock on. The rules a form checks
 * them by are in `field-rules.ts`.
 */
export {
  canonicalPhone,
  formatPhone,
  typedPhone,
} from '@b2b-catalog-platform/shared';

/** The masks' grouping rule for DigitMask, the one the API formats with. */
export function provideDigitMaskFormat(): Provider {
  return {
    provide: DIGIT_MASK_FORMAT,
    useValue: { apply: applyMask, stripPrefix: stripDialPrefix },
  };
}
