// Namespace import, not `{ z }`: the named form defeats tree shaking and
// pulls zod's 63 locale files into the bundle (colinhacks/zod#6050).
import * as z from 'zod';
import { EMAIL_PATTERN } from './email-format';
import {
  type CompanyIdFormat,
  companyIdMatchesAny,
  normalizeCompanyId,
  type PhoneConfig,
} from './contact-format';

/**
 * The contact-field schemas: a deployment's phone rule, the company-ID formats
 * it accepts, and the field types built on them. Split from `contact-format.ts`
 * so the formatting helpers can be used without Zod (see the note there).
 */

/**
 * A deployment's phone-entry rule: the fixed country code, and how to group.
 * Shared for the same reason `companyIdInputSchema` is — the browser enters a
 * number by it and the API formats one for a staff notification by it, so one
 * schema rather than a copy on each side.
 */
export const phoneInputSchema = z
  .object({
    countryCode: z.string(),
    mask: z.string().optional(),
  })
  .strict() satisfies z.ZodType<PhoneConfig>;

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

/**
 * One accepted shape of registration number. A pattern and an example of it —
 * the field is plain typed input, so there is nothing to prefix, mask or pick
 * between; what a customer types is what is stored, and the shapes are what it
 * is measured against.
 *
 * `example` is required because it is not decoration: the field's only hint and
 * its only error message are built from the configured examples, so a format
 * without one is a rule nobody is told about.
 */
export const companyIdFormatSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1).optional(),
    pattern: z.string(),
    example: z.string().min(1),
  })
  .strict()
  .superRefine((format, ctx) => {
    if (!checkPattern(format.pattern, ctx, ['pattern'])) return;

    // An example that its own pattern refuses is a hint that teaches a value
    // the field will reject; the boot fails with the field named.
    if (!new RegExp(format.pattern).test(format.example)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['example'],
        message: `example "${format.example}" does not match this format's own pattern`,
      });
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
 * A company's business registration number. The accepted *formats* are
 * jurisdiction-specific and therefore deployment configuration
 * (`companyIdInput.formats` in deployment.json) — plural, because a
 * jurisdiction can take more than one shape — not something this contract can
 * know, so all it enforces is the envelope. The deployment's own patterns are
 * applied on top, on both sides, and matching any one of them is enough.
 *
 * Normalized before it is checked, not after: a number is typed the way it is
 * printed on paper, spaces and all, and refusing `DE 123 456 789` for a space
 * would be refusing the number. What is stored is what the patterns are written
 * against — no spaces, upper case.
 */
export const companyRegistrationIdSchema = z.preprocess(
  (value) =>
    typeof value === 'string' ? normalizeCompanyId(value.trim()) : value,
  z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Z0-9-]+$/),
);

/**
 * The invoiced party's name, as the customer writes it. Free text and not a
 * key: what a company calls itself on an invoice is its own business, and no
 * registry spelling is authoritative enough to correct it with.
 */
export const companyNameSchema = z.string().trim().min(1).max(255);

/**
 * An email address as somebody types it: trimmed first, then checked.
 *
 * The order is the whole point: the trim (and any lowercasing) has to run ahead
 * of the format check, or an address pasted with a space around it — which is
 * most of the ways one arrives — is refused for the space. The pattern comes
 * from `email-format.ts` rather than from `z.email()`, so a form can apply the
 * same rule without shipping Zod to do it.
 */
export const emailField = (max: number) =>
  z.string().trim().pipe(z.string().regex(EMAIL_PATTERN).max(max));

/** The same, for the addresses stored and looked up in lower case. */
export const lowercaseEmailField = (max: number) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().regex(EMAIL_PATTERN).max(max));
