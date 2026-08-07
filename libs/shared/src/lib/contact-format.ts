/**
 * Digit masks and the one phone-number format, shared because **both** apps
 * need them: the browser to enter and display a number, the API to put a
 * readable one into a staff notification.
 *
 * Pure string functions on purpose — no Angular, no Nest. The Angular
 * validators built on top live with the web app (`core/masked-input.ts`).
 */

/** A deployment's phone-entry rule: the fixed country code, and how to group. */
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
