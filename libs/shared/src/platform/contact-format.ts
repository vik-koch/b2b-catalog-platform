/**
 * Phone and company-ID helpers, import-free: a module that builds a schema
 * cannot be tree-shaken down to its helpers, so the schemas are in
 * `contact-config.ts`.
 */

/** A deployment's phone-entry rule: the fixed country code, and how to group. */
export interface PhoneConfig {
  readonly countryCode: string;
  readonly mask?: string;
}

/** The bare digits of a masked value: what is stored. */
export const digitsOf = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '');

/** How many digits a mask asks for. */
export const maskLength = (mask: string): number =>
  (mask.match(/#/g) ?? []).length;

/**
 * Groups digits by a mask: `#` is a digit, anything else a literal
 * (`(###) ###-####`). An empty mask means digits only, with no limit; digits
 * past the mask are dropped, and a partial value is grouped partially.
 */
export const applyMask = (value: string, mask: string): string => {
  const digits = digitsOf(value);
  if (!mask) return digits;

  const capped = digits.slice(0, maskLength(mask));
  let out = '';
  let next = 0;
  for (const ch of mask) {
    if (next >= capped.length) break;
    out += ch === '#' ? capped[next++] : ch;
  }
  return out;
};

/**
 * Removes a leading `+49` or `0049` from a field that holds the national part
 * beside a shown country code: autofill brings the full international number,
 * which would otherwise be stored as `+4949…`. A bare `49…` is kept, as a
 * national number may begin with those digits.
 */
export function stripDialPrefix(value: string, prefix: string): string {
  const code = digitsOf(prefix);
  if (!code) return value;

  const trimmed = value.trimStart();
  const opener = /^(?:\+|00)/.exec(trimmed)?.[0];
  if (!opener) return value;

  // Digit by digit: an autofilled number has its own separators ("+49 (40) 123").
  let rest = trimmed.slice(opener.length);
  for (const digit of code) {
    const next = /^\D*(\d)/.exec(rest);
    if (!next || next[1] !== digit) return value;
    rest = rest.slice(next[0].length);
  }
  return rest;
}

/**
 * The stored form: country code and national digits, no separators
 * (`+49401234501`), so regrouping the mask later leaves stored numbers right.
 * Without a `phoneInput` rule, what was typed is stored.
 */
export function canonicalPhone(
  typed: string,
  config: PhoneConfig | undefined,
): string {
  if (!config) return typed.trim();
  const national = digitsOf(typed);
  return national ? `${config.countryCode}${national}` : '';
}

/**
 * The server's reading of a typed number: the stored form, or null where the
 * rule cannot read it (FR-AUTH-12). An API client may send it grouped or
 * national only. A dial prefix must be this deployment's country code, and the
 * national part must fill the mask. Without a rule, kept as typed.
 */
export function normalizePhone(
  value: string,
  config: PhoneConfig | undefined,
): string | null {
  const trimmed = value.trim();
  if (!config) return trimmed;
  if (/[^\d\s()+\-./]/.test(trimmed)) return null;

  const international = /^(?:\+|00)/.test(trimmed);
  const rest = stripDialPrefix(trimmed, config.countryCode);
  if (international && rest === trimmed) return null;

  const national = digitsOf(rest);
  if (!national) return null;
  if (config.mask && national.length !== maskLength(config.mask)) return null;
  return `${config.countryCode}${national}`;
}

/** The part the entry field holds: the stored number minus the country code.
 * A number with another code is handed back whole rather than reattributed. */
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

/** A stored number grouped for reading (`+49 (40) 123-4501`). One that does
 * not fit the mask is shown as stored rather than grouped by half. */
export function formatPhone(
  stored: string | null | undefined,
  config: PhoneConfig | undefined,
): string {
  const value = stored?.trim() ?? '';
  if (!value || !config?.mask) return value;

  const national = typedPhone(value, config);
  if (national === value) return value;
  if (digitsOf(national) !== national) return value;
  if (national.length !== maskLength(config.mask)) return value;

  return `${config.countryCode} ${applyMask(national, config.mask)}`;
}

/** One accepted shape of a company ID (FR-AUTH-01): a jurisdiction may accept
 * several, such as a domestic number and a VAT number. */
export interface CompanyIdFormat {
  /** Stable identity, used as the picker's value. Never stored or sent. */
  readonly key: string;
  /** What to call it in the picker. Required once there is more than one. */
  readonly label?: string;
  /** Anchored, against the normalized value. */
  readonly pattern: string;
  /** A real number in this shape: the field's hint, and a config self-check. */
  readonly example?: string;
}

/** The format a stored number is in, for the staff editor's picker; the first
 * where patterns overlap, undefined where none fits. */
export function companyIdFormatOf(
  stored: string | null | undefined,
  formats: readonly CompanyIdFormat[] | undefined,
): CompanyIdFormat | undefined {
  const value = stored?.trim();
  if (!value) return undefined;
  return formats?.find((format) => fitsFormat(value, format));
}

function fitsFormat(value: string, format: CompanyIdFormat): boolean {
  return new RegExp(format.pattern).test(value);
}

/** No spaces, upper case: the form a number is stored and compared in, and
 * the one configured patterns are written against. */
export function normalizeCompanyId(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** No formats configured means no shape rule beyond the contract's envelope. */
export function companyIdMatchesAny(
  value: string,
  formats: readonly CompanyIdFormat[] | undefined,
): boolean {
  if (!formats?.length) return true;
  return formats.some((format) =>
    fitsFormat(normalizeCompanyId(value), format),
  );
}
