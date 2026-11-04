/**
 * What a valid email address is, on both sides. A pattern rather than a
 * schema, so a form checks it without loading Zod. Stricter than Angular's
 * `email`, which accepts `a@b`: an address without a dotted domain is a typo.
 */
export const EMAIL_PATTERN =
  /^[^\s@,;:<>()[\]\\"]+@[^\s@.,;:<>()[\]\\"]+(?:\.[^\s@.,;:<>()[\]\\"]+)+$/;

export function isEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}
