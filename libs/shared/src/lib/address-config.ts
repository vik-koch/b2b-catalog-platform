import { z } from 'zod';
import { countryCodeSchema } from './address.contract';

/**
 * Where this deployment ships — the jurisdiction-specific half of the address
 * form, beside `phoneInput` and `companyIdInput`. Shared, because the API
 * applies the same rule the browser does: a country list enforced only in a
 * `<select>` is not a rule.
 */
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
          .object({ code: countryCodeSchema, label: z.string().min(1) })
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
