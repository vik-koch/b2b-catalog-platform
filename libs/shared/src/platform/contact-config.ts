import * as z from 'zod';
import { EMAIL_MAX_LENGTH, EMAIL_PATTERN } from './email-format';
import { PERSON_NAME_MAX_LENGTH, PERSON_NAME_PATTERN } from './person-name';
import {
  normalizeCompanyId,
  type CompanyIdFormat,
  type PhoneConfig,
} from './contact-format';

/** The contact-field schemas; the helpers they rely on are import-free in
 * `contact-format.ts`. */

/** The browser enters a number by it and the API formats one by it. */
export const phoneInputSchema = z
  .object({
    countryCode: z.string(),
    mask: z.string().optional(),
  })
  .strict() satisfies z.ZodType<PhoneConfig>;

/** A deployment's pattern is trusted but runs against visitor input, so it
 * must be anchored and short. */
function checkPattern(
  pattern: string,
  ctx: z.RefinementCtx,
  path: string[],
): boolean {
  if (pattern.length > 200) {
    ctx.addIssue({
      code: 'custom',
      path,
      message: 'pattern is too long (max 200 characters)',
    });
    return false;
  }
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
    ctx.addIssue({
      code: 'custom',
      path,
      message:
        'pattern must be anchored with ^ and $ so it matches the whole value',
    });
    return false;
  }
  return true;
}

/** `example` is required: the field's hint and its error are built from the
 * examples, so a format without one is a rule nobody is told about. */
const companyIdFormatSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1).optional(),
    pattern: z.string(),
    example: z.string().min(1),
  })
  .strict()
  .superRefine((format, ctx) => {
    if (!checkPattern(format.pattern, ctx, ['pattern'])) return;

    // A hint its own pattern refuses would teach a value the field rejects.
    if (!new RegExp(format.pattern).test(format.example)) {
      ctx.addIssue({
        code: 'custom',
        path: ['example'],
        message: `example "${format.example}" does not match this format's own pattern`,
      });
    }
  }) satisfies z.ZodType<CompanyIdFormat>;

export const companyIdInputSchema = z
  .object({ formats: z.array(companyIdFormatSchema).min(1) })
  .strict()
  // A label names a format in the picker, which only several formats have.
  .superRefine((input, ctx) => {
    if (input.formats.length < 2) return;
    input.formats.forEach((format, index) => {
      if (!format.label) {
        ctx.addIssue({
          code: 'custom',
          path: ['formats', index, 'label'],
          message: 'label is required when several formats are configured',
        });
      }
    });
  });

/** The envelope only; the deployment's formats apply on top, on both sides.
 * Normalized before the check, so a number typed with spaces is accepted. */
export const companyRegistrationIdSchema = z.preprocess(
  (value) =>
    typeof value === 'string' ? normalizeCompanyId(value.trim()) : value,
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9-]+$/),
);

/** Free text and not a key: no registry spelling outranks the company's own. */
export const companyNameSchema = z.string().trim().min(1).max(255);

const emailRule = z.string().regex(EMAIL_PATTERN).max(EMAIL_MAX_LENGTH);

/** Trimmed before the check, as a pasted address often carries a space. */
export const emailField = z.string().trim().pipe(emailRule);

/** The same, for the addresses stored and looked up in lower case. */
export const lowercaseEmailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(emailRule);

/** A read applies the write's rule and no more: a stricter `z.email()` would
 * fail a stored `a@a.a`, and with it every list that row is on. */
export const storedEmailField = z.string().regex(EMAIL_PATTERN);

/**
 * A first, last or inquiry name as a person types it. Only for writes: a
 * stored name may predate the rule, and the customer exchange is not held to
 * it, as source systems keep placeholders such as "Kunde 123" and refusing
 * one would fail a run. Such an account is asked again at its next hand edit.
 */
export const personNameField = z
  .string()
  .trim()
  .min(1)
  .max(PERSON_NAME_MAX_LENGTH)
  .regex(PERSON_NAME_PATTERN);
