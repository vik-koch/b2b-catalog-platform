import { ValidatorFn, Validators } from '@angular/forms';
import { digitsOf, type PhoneConfig } from '@b2b-catalog-platform/shared';
import { completeMask } from './masked-input';

/**
 * The two deployment-configured identity fields — a phone number and a company
 * registration number — in both directions.
 *
 * Each is stored in one canonical form (`+49401234501`, `DE123456789`) while
 * being *entered* in two parts: a fixed prefix the form displays and the visitor
 * never types, and a masked body. Registration composes those into the stored
 * value; the staff editor has to take a stored value apart again to seed the
 * same fields. Keeping both directions together is what stops the two screens
 * disagreeing about where the prefix ends.
 *
 * The phone half of that lives in `@b2b-catalog-platform/shared` — the API
 * formats numbers for staff notifications and needs the same rule — and is
 * re-exported here so a form has one door to knock on. The registration number
 * stays here: only the browser has ever had to take one apart.
 *
 * Shape only — the wording, the markup and the deployment config itself stay
 * with each page (public app-text on one side, admin-text on the other).
 */
export {
  canonicalPhone,
  formatPhone,
  typedPhone,
  type PhoneConfig,
} from '@b2b-catalog-platform/shared';

export interface CompanyIdConfig {
  readonly prefix?: string;
  readonly pattern: string;
  readonly mask?: string;
}

/**
 * What travels and gets stored. A mask only groups digits for readability, and
 * a prefix is shown rather than typed, so both are resolved away here into the
 * one form the deployment's pattern describes and the shop's records use.
 */
export function canonicalCompanyId(
  typed: string,
  config: CompanyIdConfig | undefined,
): string {
  const body = config?.mask ? digitsOf(typed) : typed.trim();
  return body ? `${config?.prefix ?? ''}${body}` : '';
}

/** The inverse: the part the field owns, with the displayed prefix removed. */
export function typedCompanyId(
  stored: string | null,
  config: CompanyIdConfig | undefined,
): string {
  const value = stored?.trim() ?? '';
  const prefix = config?.prefix;
  return prefix && value.startsWith(prefix)
    ? value.slice(prefix.length)
    : value;
}

/**
 * The deployment's own rule, applied to the value **as it will be sent** —
 * `pattern` is anchored on the stored form, prefix included, so validating the
 * typed part against it would never match.
 */
export function companyIdPattern(config: CompanyIdConfig): ValidatorFn {
  const regex = new RegExp(config.pattern);
  return (control) => {
    const value = canonicalCompanyId(String(control.value ?? ''), config);
    return !value || regex.test(value) ? null : { companyIdFormat: true };
  };
}

/**
 * The rules a registration-number field carries when it applies at all — it is
 * required exactly when the account is a company, so both forms that have one
 * swap this set in and out as the customer type changes.
 */
export function companyIdValidators(
  config: CompanyIdConfig | undefined,
): ValidatorFn[] {
  return [
    Validators.required,
    ...(config ? [companyIdPattern(config)] : []),
    ...(config?.mask ? [completeMask(config.mask)] : []),
  ];
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
