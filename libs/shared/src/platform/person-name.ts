/** The longest first, last or contact name a form takes. */
export const PERSON_NAME_MAX_LENGTH = 200;

/**
 * No naming system writes a digit, in any script, so one in a person's name is
 * a typo or a placeholder. A pattern, so a form checks it without loading Zod.
 */
export const PERSON_NAME_PATTERN = /^\P{Nd}*$/u;

export function isPersonName(value: string): boolean {
  return PERSON_NAME_PATTERN.test(value);
}
