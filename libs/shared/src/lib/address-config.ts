import * as z from 'zod';
import { countryCodeSchema } from './address.contract';
import { normalizePostalCode } from './postal-code';

/**
 * Where this deployment ships — the jurisdiction-specific half of the address
 * form, beside `phoneInput` and `companyIdInput`. Shared, because the API
 * applies the same rule the browser does: a country list enforced only in a
 * `<select>` is not a rule.
 */

/**
 * What a postal code looks like in one country. Per country rather than per
 * deployment, because that is what it is a property of: a shop shipping to two
 * of them has two shapes, and one rule averaged over both accepts everything.
 *
 * `pattern` is the rule and `example` is what the form says when it is broken,
 * as with a registration number's formats. `mask` is the entry aid where a code
 * is digits and nothing else (`######`) — it caps the field at its own length,
 * and there is nothing to cap where a code carries letters.
 *
 * Optional throughout: a country configured without one is held to what the
 * contract already asks, which is that the field is filled in.
 */
export const postalCodeRuleSchema = z
  .object({
    /** Anchored regex for the normalized code — no spaces, upper case. */
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
        code: z.ZodIssueCode.custom,
        path: ['pattern'],
        message: 'pattern is too long (max 200 characters)',
      });
      return;
    }
    if (!rule.pattern.startsWith('^') || !rule.pattern.endsWith('$')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
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
        code: z.ZodIssueCode.custom,
        path: ['example'],
        message: `example "${rule.example}" does not match this country's own postal pattern`,
      });
    }
    if (rule.mask && /[^#\s\-/]/.test(rule.mask)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mask'],
        message: 'a postal mask is # for a digit and separators around them',
      });
    }
  });

export type PostalCodeRule = z.infer<typeof postalCodeRuleSchema>;

export const addressConfigSchema = z
  .object({
    /**
     * The countries an address may be in, in the order the picker offers them.
     * The first is the default for a new address — a separate "default" key
     * would be one more thing to keep consistent with the list.
     */
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
              code: z.ZodIssueCode.custom,
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
