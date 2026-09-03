/**
 * The one definition of a valid email address, as plain data.
 *
 * Both sides need the identical rule: the API refuses what does not match, and
 * the forms mark a field invalid before anyone submits it. Sharing the *schema*
 * would have been the obvious way to do that, and it is what this used to do —
 * but a schema is Zod, and Zod is ~118 kB the browser would download to check a
 * pattern it can test itself. So the pattern is the shared thing, and the
 * schema is built from it (see `contact-format.ts`).
 *
 * Deliberately stricter than Angular's `Validators.email`, which accepts `a@b`:
 * a real address has a dotted domain, and an address with no TLD is a typo we
 * would rather catch in the form than bounce a day later.
 */
export const EMAIL_PATTERN =
  /^[^\s@,;:<>()[\]\\"]+@[^\s@.,;:<>()[\]\\"]+(?:\.[^\s@.,;:<>()[\]\\"]+)+$/;

/** Whether a value is an address both sides would accept. */
export function isEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}
