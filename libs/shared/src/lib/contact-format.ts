import { z } from 'zod';

/**
 * Digit masks, the one phone-number format, and the company registration
 * number's accepted shapes — shared because **both** apps need them: the
 * browser to enter and display a number, the API to put a readable one into a
 * staff notification and to re-apply the rule a browser must never be trusted
 * with alone.
 *
 * No Angular and no Nest here. The Angular validators built on top live with
 * the web app (`core/masked-input.ts`, `core/contact-fields.ts`).
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

/**
 * One accepted shape of a company registration number (FR-AUTH-01).
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
 * A pattern is written by whoever owns the deployment, so it is trusted — but
 * it is still compiled at runtime and run against visitor input, so it has to
 * be anchored (or it would match a substring of anything) and short.
 */
function checkPattern(
  pattern: string,
  ctx: z.RefinementCtx,
  path: string[],
): boolean {
  if (pattern.length > 200) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message: 'pattern is too long (max 200 characters)',
    });
    return false;
  }
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path,
      message:
        'pattern must be anchored with ^ and $ so it matches the whole value',
    });
    return false;
  }
  return true;
}

export const companyIdFormatSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1).optional(),
    pattern: z.string(),
    prefix: z.string().optional(),
    mask: z.string().optional(),
    example: z.string().optional(),
  })
  .strict()
  /**
   * `prefix` and `mask` are promises about `pattern` that no regex can be asked
   * to confirm, so the example is made load-bearing: it is checked against all
   * three. A deployment that sets a nine-digit mask on a format that is twelve
   * digits long fails the boot with the field named, instead of shipping a
   * field nobody can fill in.
   */
  .superRefine((format, ctx) => {
    if (!checkPattern(format.pattern, ctx, ['pattern'])) return;

    const { example } = format;
    if (example === undefined) return;

    if (!new RegExp(format.pattern).test(example)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['example'],
        message: `example "${example}" does not match this format's own pattern`,
      });
    }
    if (format.prefix && !example.startsWith(format.prefix)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['example'],
        message: `example "${example}" does not start with the prefix "${format.prefix}"`,
      });
    }
    if (format.mask) {
      const typed = format.prefix
        ? example.slice(format.prefix.length)
        : example;
      if (digitsOf(typed).length !== maskLength(format.mask)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['mask'],
          message: `mask takes ${maskLength(format.mask)} digits, but the example has ${digitsOf(typed).length}`,
        });
      }
    }
  });

export const companyIdInputSchema = z
  .object({ formats: z.array(companyIdFormatSchema).min(1) })
  .strict()
  // Nothing to pick between when there is one, so a label would be unused
  // config; the moment there are two, the picker has to be able to name them.
  .superRefine((input, ctx) => {
    if (input.formats.length < 2) return;
    input.formats.forEach((format, index) => {
      if (!format.label) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['formats', index, 'label'],
          message: 'label is required when several formats are configured',
        });
      }
    });
  });

export type CompanyIdInput = z.infer<typeof companyIdInputSchema>;

/**
 * Which shape a stored number is in — how the staff editor knows what to put in
 * the picker for an account it is opening.
 *
 * `undefined` for a number that fits none of them: one from before the current
 * config, or from an import. The field shows such a value unmasked rather than
 * forcing it into a shape it does not have, because a mask would truncate it
 * and the save would then quietly store the truncation.
 */
export function companyIdFormatOf(
  stored: string | null | undefined,
  formats: readonly CompanyIdFormat[] | undefined,
): CompanyIdFormat | undefined {
  const value = stored?.trim();
  if (!value) return undefined;
  return formats?.find((format) => new RegExp(format.pattern).test(value));
}
