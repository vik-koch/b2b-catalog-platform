import { ValidatorFn, Validators } from '@angular/forms';
import {
  type CompanyIdFormat,
  companyIdMatchesAny,
  type PhoneConfig,
} from '@b2b-catalog-platform/shared';
import { completeMask } from './masked-input';

/**
 * The two deployment-configured identity fields — a phone number and a company
 * registration number — in both directions.
 *
 * A phone number is stored in one canonical form (`+49401234501`) while being
 * *entered* in two parts: a fixed prefix the form displays and the visitor never
 * types, and a masked body. Registration composes those into the stored value;
 * the staff editor takes a stored value apart again to seed the same fields.
 * Keeping both directions together is what stops the two screens disagreeing
 * about where the prefix ends.
 *
 * A registration number has none of that: it is plain typed input, normalized
 * by the contract, and measured against the shapes the deployment accepts.
 *
 * The phone half lives in `@b2b-catalog-platform/shared` — the API formats
 * numbers for staff notifications and needs the same rule — and is re-exported
 * here so a form has one door to knock on.
 *
 * Shape only — the wording, the markup and the deployment config itself stay
 * with each page (public app-text on one side, admin-text on the other).
 */
export {
  canonicalPhone,
  formatPhone,
  typedPhone,
  type CompanyIdFormat,
  type PhoneConfig,
} from '@b2b-catalog-platform/shared';

/**
 * The deployment's shape rule, applied to the whole value. One message covers
 * every configured format: which of them a number was meant to be is the
 * customer's business, not a question the form asks them to answer first.
 */
export function companyIdFormat(
  formats: readonly CompanyIdFormat[] | undefined,
): ValidatorFn {
  return (control) => {
    const value = String(control.value ?? '').trim();
    return !value || companyIdMatchesAny(value, formats)
      ? null
      : { companyIdFormat: true };
  };
}

/**
 * The rules a registration-number field carries when it applies at all — it is
 * required exactly when the account is a company. Both forms that have one swap
 * this set in and out as the customer type changes.
 */
export function companyIdValidators(
  formats: readonly CompanyIdFormat[] | undefined,
): ValidatorFn[] {
  return [Validators.required, companyIdFormat(formats)];
}

/**
 * The rules a phone field carries, in one place because all four forms that
 * have one disagreed about them at least once. Completeness applies even where
 * the number is optional: empty is a choice, half a number is a typo.
 */
export function phoneValidators(
  config: PhoneConfig | undefined,
  required: boolean,
): ValidatorFn[] {
  return [
    ...(required ? [Validators.required] : []),
    ...(config?.mask ? [completeMask(config.mask)] : []),
  ];
}
