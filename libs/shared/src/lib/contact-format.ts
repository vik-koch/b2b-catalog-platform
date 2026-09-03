/**
 * Digit masks, phone-number formatting and company-registration helpers — the
 * pure ones, deliberately free of any import.
 *
 * The schemas that use these shapes live in `contact-config.ts`. They are apart
 * because a module that builds a Zod schema cannot be tree-shaken back down to
 * its helpers: `z.string()` is a call a bundler has to assume matters, so one
 * imported formatter would put the whole validation runtime in the browser's
 * first load (see `auth-constants.ts`).
 */

/**
 * A deployment's phone-entry rule: the fixed country code, and how to group.
 * Declared here as a plain shape; `contact-config.ts` holds the schema that
 * parses it, and is checked against this.
 */
export interface PhoneConfig {
  readonly countryCode: string;
  readonly mask?: string;
}

/** The bare digits of a masked value — what actually gets stored. */
export const digitsOf = (value: string | null | undefined): string =>
  (value ?? '').replace(/\D/g, '');

/** How many digits a mask asks for. */
export const maskLength = (mask: string): number =>
  (mask.match(/#/g) ?? []).length;

/**
 * Groups digits per a mask where `#` is one digit and every other character is
 * a literal separator (`(###) ###-####`). An empty mask means "digits only" —
 * no grouping and no length limit. Anything past the mask's last `#` is
 * dropped, and a partial value gets a partial grouping.
 *
 * The one place the grouping rule lives: DigitMask formats with it while the
 * visitor types, and `formatPhone` formats stored numbers for reading.
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
 * Removes a leading international dial prefix from a value that is expected to
 * hold the **national** part alone — the form displays the country code beside
 * the field, so a number that carries one too would be counted twice.
 *
 * Written for autofill: a browser fills a phone field from whatever it stored,
 * which is usually the full international number (`+49 40 1234567`, or
 * `0049…`), while the field beneath the `+49` prefix wants `40 1234567`.
 * Without this the digits are masked as they arrive and stored as `+4949…`.
 *
 * The two international forms are unambiguous, so both are stripped. A bare
 * `49…` is left exactly as typed: a national number may legitimately begin with
 * its own country's digits, and there is no way to tell the two apart.
 */
export function stripDialPrefix(value: string, prefix: string): string {
  const code = digitsOf(prefix);
  if (!code) return value;

  const trimmed = value.trimStart();
  const opener = /^(?:\+|00)/.exec(trimmed)?.[0];
  if (!opener) return value;

  // Matched digit by digit rather than as a string: the separators inside an
  // autofilled number are the provider's, not ours ("+49 (40) 123").
  let rest = trimmed.slice(opener.length);
  for (const digit of code) {
    const next = /^\D*(\d)/.exec(rest);
    if (!next || next[1] !== digit) return value;
    rest = rest.slice(next[0].length);
  }
  return rest;
}

/**
 * What gets stored: country code + the national digits, with no separators of
 * any kind (`+49401234501`). The mask groups digits for *reading* and is
 * deployment UI config, so storing its separators would bake a presentation
 * choice into the data — and a deployment that later regrouped its numbers
 * would find every stored one silently wrong. Same rule as the registration
 * number, which has always been stored unmasked.
 *
 * A deployment with no `phoneInput` at all has no grouping rule to strip, so
 * whatever was typed is stored as typed.
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
 * The inverse: the digits the entry field owns, with the displayed country
 * code removed. A stored number that does not start with the configured code
 * is handed back whole rather than mangled — it predates the current config,
 * and silently reattributing somebody's phone number to another country is
 * worse than showing it as it is.
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

/**
 * For reading rather than editing — the account record, the staff list, a
 * notification. Puts the deployment's grouping back on, so `+49401234501`
 * reads as `+49 (40) 123-4501`.
 *
 * A number that does not fit the configured mask is shown as stored. It is
 * either from another country or from before this mask, and a half-applied
 * grouping would misrepresent it.
 */
export function formatPhone(
  stored: string | null | undefined,
  config: PhoneConfig | undefined,
): string {
  const value = stored?.trim() ?? '';
  if (!value || !config?.mask) return value;

  const national = typedPhone(value, config);
  // Another country's number, or one with something in it the mask has no
  // place for, or one that does not fill the mask: all shown as stored.
  if (national === value) return value;
  if (digitsOf(national) !== national) return value;
  if (national.length !== maskLength(config.mask)) return value;

  return `${config.countryCode} ${applyMask(national, config.mask)}`;
}

/**
 * One accepted shape of a company ID (FR-AUTH-01).
 *
 * A jurisdiction can accept several — a sole trader's ten digits and a
 * registered company's twelve, a domestic number and a VAT number — and they
 * differ in every way that matters to the field: length, prefix, grouping, and
 * what to call the thing. So each shape carries its own, rather than one rule
 * carrying a list of exceptions.
 *
 * `prefix` and `mask` are per format for exactly that reason. A prefix is not
 * data, it is the affordance for the part the visitor never types, and it only
 * exists while it cannot be anything else; a mask caps entry at its own length.
 * Neither survives being averaged over several shapes — which is why the field
 * asks *which shape* first, and why there is no deployment-wide prefix.
 */
export interface CompanyIdFormat {
  /** Stable identity, used as the picker's value. Never stored or sent. */
  readonly key: string;
  /** What to call it in the picker. Required once there is more than one. */
  readonly label?: string;
  /** Anchored regex for the **stored** value, prefix included. */
  readonly pattern: string;
  /** Fixed leading characters the visitor does not type, e.g. `DE`. */
  readonly prefix?: string;
  /** Digit mask for the typed part, `#` per digit (see DigitMask). */
  readonly mask?: string;
  /** A real number in this shape — the format hint, and a config self-check. */
  readonly example?: string;
}

/**
 * Which shape a stored number is in — how the staff editor knows what to put in
 * the picker for an account it is opening.
 *
 * `undefined` for a number that fits none of them: one from before the current
 * config, or from an import. Where two patterns overlap the first wins — they
 * are a deployment's own list, and a number in both is in both.
 */
export function companyIdFormatOf(
  stored: string | null | undefined,
  formats: readonly CompanyIdFormat[] | undefined,
): CompanyIdFormat | undefined {
  const value = stored?.trim();
  if (!value) return undefined;
  return formats?.find((format) => fitsFormat(value, format));
}

/** Whether a stored number is in this format. The pattern is the whole rule:
 * it is anchored, and nothing dresses the value up any more. */
function fitsFormat(value: string, format: CompanyIdFormat): boolean {
  return new RegExp(format.pattern).test(value);
}

/**
 * The one form a registration number is stored and compared in: no spaces,
 * upper case. Applied by the contract itself, so the browser and the API cannot
 * disagree about whether `de 123 456 789` is the number `DE123456789`.
 *
 * Configured patterns are therefore written against upper-case values.
 */
export function normalizeCompanyId(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Whether a number is one of the shapes this deployment accepts. No formats
 * configured means no shape rule — the envelope in the contract still applies. */
export function companyIdMatchesAny(
  value: string,
  formats: readonly CompanyIdFormat[] | undefined,
): boolean {
  if (!formats?.length) return true;
  return formats.some((format) =>
    fitsFormat(normalizeCompanyId(value), format),
  );
}
