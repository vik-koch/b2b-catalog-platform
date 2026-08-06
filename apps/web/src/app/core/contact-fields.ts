import { ValidatorFn } from '@angular/forms';
import { digitsOf } from './masked-input';

/**
 * The two deployment-configured identity fields — a phone number and a company
 * registration number — in both directions.
 *
 * Each is stored in one canonical form (`+49 30 1234567`, `DE123456789`) while
 * being *entered* in two parts: a fixed prefix the form displays and the visitor
 * never types, and a masked body. Registration composes those into the stored
 * value; the staff editor has to take a stored value apart again to seed the
 * same fields. Keeping both directions here is what stops the two screens
 * disagreeing about where the prefix ends.
 *
 * Shape only — the wording, the markup and the deployment config itself stay
 * with each page (public app-text on one side, admin-text on the other).
 */
export interface CompanyIdConfig {
  readonly prefix?: string;
  readonly pattern: string;
  readonly mask?: string;
}

export interface PhoneConfig {
  readonly countryCode: string;
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

/** Country code + the typed national part, which is how it is stored. */
export function canonicalPhone(
  typed: string,
  config: PhoneConfig | undefined,
): string {
  const national = typed.trim();
  if (!national) return '';
  return config ? `${config.countryCode} ${national}` : national;
}

/**
 * The inverse. A stored number that does not start with the configured country
 * code is handed back whole rather than mangled: it predates the current
 * config, and silently reformatting somebody's phone number is worse than
 * showing it as it is.
 */
export function typedPhone(
  stored: string | null,
  config: PhoneConfig | undefined,
): string {
  const value = stored?.trim() ?? '';
  const code = config?.countryCode;
  return code && value.startsWith(code)
    ? value.slice(code.length).trim()
    : value;
}
