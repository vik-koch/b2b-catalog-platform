import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@b2b-catalog-platform/shared';

/**
 * The contract's length limits, from the constants rather than its schema so
 * the page loads no Zod. One key for both ends, as the schema check had: the
 * ceiling is far past anything typed, so its wording is the floor's.
 */
export const passwordLength: ValidatorFn = (control) => {
  const length = String(control.value ?? '').length;
  return length === 0 ||
    (length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH)
    ? null
    : { tooShort: true };
};

/**
 * Group validator: the password and its confirmation must agree. Lives here
 * rather than in one form, because every screen that sets a password needs the
 * same rule and the same error key.
 */
export const passwordsMatch = (
  group: AbstractControl,
): ValidationErrors | null => {
  const password = group.get('newPassword')?.value;
  const confirmation = group.get('confirmPassword')?.value;
  return password === confirmation ? null : { mismatch: true };
};

/**
 * The alphabet a generated password is drawn from: no `l`/`I`/`1` or `O`/`0`,
 * because a generated password gets read off a screen and typed on a phone at
 * least once. No symbols either — length is what makes it strong (the server
 * enforces no composition rules, deliberately), and symbols cost more in
 * transcription errors than they add in entropy.
 */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A password nobody has to invent. 20 characters of this alphabet is ~115
 * bits, far past anything guessable, and the visitor can see it (the field has
 * a reveal toggle) and paste it into their password manager.
 *
 * `crypto.getRandomValues`, never `Math.random`: the latter is predictable
 * from its own previous outputs, which is exactly the property a password
 * cannot have. Modulo bias is avoided by rejecting the tail of the byte range
 * rather than wrapping it.
 */
export function generatePassword(length = 20): string {
  const limit = 256 - (256 % ALPHABET.length);
  const out: string[] = [];

  while (out.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= limit) continue;
      out.push(ALPHABET[byte % ALPHABET.length]);
      if (out.length === length) break;
    }
  }
  return out.join('');
}
