import { InjectionToken } from '@angular/core';

/**
 * How DigitMask groups digits, provided once by the app: whatever stores the
 * value formats it the same way, so the rule cannot live here.
 */
export interface DigitMaskFormat {
  /** `#` is a digit, anything else a separator; an empty mask is digits only. */
  apply(value: string, mask: string): string;
  /** Takes a fixed prefix (a country code) off an autofilled full value. */
  stripPrefix(value: string, prefix: string): string;
}

/** No default: a field formatting by a different rule is worse than an error. */
export const DIGIT_MASK_FORMAT = new InjectionToken<DigitMaskFormat>(
  'DIGIT_MASK_FORMAT',
);
