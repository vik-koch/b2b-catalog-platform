import * as z from 'zod';
import { countryCodeSchema } from './address.contract';
import { normalizePostalCode } from './postal-code';

/** Where the deployment ships: the jurisdiction's half of the address form,
 * beside `phoneInput` and `companyIdInput`. Shared, as the API applies it too:
 * a list held only by a `<select>` is no rule. */

/**
 * A postal code's shape in one country: two countries have two, and one rule
 * for both accepts anything. `pattern` is the rule, `example` what the form
 * shows when it is broken; `mask` caps an all-digit code (`######`) at its
 * length. Optional: without them the field need only be filled in.
 */
export const postalCodeRuleSchema = z
  .object({
    /** An anchored regex for the normalised code: no spaces, upper case. */
    pattern: z.string(),
    /** A real code in this shape: the field's hint, its error, and a check
     * that the pattern itself is what the deployment meant. */
    example: z.string().min(1),
    /** Digit mask, `#` per digit. Digits-only formats alone. */
    mask: z.string().optional(),
  })
  .strict()
  .superRefine((rule, ctx) => {
    if (rule.pattern.length > 200) {
      ctx.addIssue({
        code: 'custom',
        path: ['pattern'],
        message: 'pattern is too long (max 200 characters)',
      });
      return;
    }
    if (!rule.pattern.startsWith('^') || !rule.pattern.endsWith('$')) {
      ctx.addIssue({
        code: 'custom',
        path: ['pattern'],
        message:
          'pattern must be anchored with ^ and $ so it matches the whole value',
      });
      return;
    }
    // An example its own pattern refuses is a hint that teaches a value the
    // field will reject; the boot fails with the field named.
    if (!new RegExp(rule.pattern).test(normalizePostalCode(rule.example))) {
      ctx.addIssue({
        code: 'custom',
        path: ['example'],
        message: `example "${rule.example}" does not match this country's own postal pattern`,
      });
    }
    if (rule.mask && /[^#\s\-/]/.test(rule.mask)) {
      ctx.addIssue({
        code: 'custom',
        path: ['mask'],
        message: 'a postal mask is # for a digit and separators around them',
      });
    }
  });

export type PostalCodeRule = z.infer<typeof postalCodeRuleSchema>;

export const addressConfigSchema = z
  .object({
    /** The countries an address may be in, in the picker's order; the first
     * is a new address's default. */
    countries: z
      .array(
        z
          .object({
            code: countryCodeSchema,
            label: z.string().min(1),
            postalCode: postalCodeRuleSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .superRefine((countries, ctx) => {
        const seen = new Set<string>();
        countries.forEach((country, index) => {
          if (seen.has(country.code)) {
            ctx.addIssue({
              code: 'custom',
              path: [index, 'code'],
              message: `country ${country.code} is listed twice`,
            });
          }
          seen.add(country.code);
        });
      }),
  })
  .strict();

export type AddressConfig = z.infer<typeof addressConfigSchema>;
