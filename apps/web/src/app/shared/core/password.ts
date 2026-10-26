import {
  required,
  validate,
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
} from '@angular/forms/signals';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '@b2b-catalog-platform/shared';

type StringPath<K extends PathKind> = SchemaPath<
  string,
  SchemaPathRules.Supported,
  K
>;

/**
 * A new password: present, and within the contract's limits, read from the
 * constants rather than its schema so the page loads no Zod. The ceiling is
 * far past anything typed, so it shares the floor's wording.
 */
export function newPassword<K extends PathKind>(
  path: StringPath<K>,
  text: { required: string; length: string },
): void {
  required(path, { message: text.required });
  validate(path, ({ value }) => {
    const length = value().length;
    return length === 0 ||
      (length >= PASSWORD_MIN_LENGTH && length <= PASSWORD_MAX_LENGTH)
      ? undefined
      : { kind: 'length', message: text.length };
  });
}

/**
 * The confirmation has to match the password it repeats. Required without a
 * message of its own: left empty, it is the mismatch that says why.
 */
export function confirmation<K extends PathKind>(
  path: StringPath<K>,
  password: StringPath<K>,
  message: string,
): void {
  required(path);
  validate(path, ({ value, valueOf }) =>
    value() === valueOf(password) ? undefined : { kind: 'mismatch', message },
  );
}

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
