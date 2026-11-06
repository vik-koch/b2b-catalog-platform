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
} from '@b2b-catalog-platform/shared/core/accounts';

type StringPath<K extends PathKind> = SchemaPath<
  string,
  SchemaPathRules.Supported,
  K
>;

/**
 * Within the contract's limits, from its constants so the page loads no Zod.
 * The ceiling is a message, not a `maxlength`: a pasted password cut short
 * would be saved as one its owner never had.
 */
export function newPassword<K extends PathKind>(
  path: StringPath<K>,
  text: { required: string; tooShort: string; tooLong: string },
): void {
  required(path, { message: text.required });
  validate(path, ({ value }) => {
    const length = value().length;
    if (length > PASSWORD_MAX_LENGTH) {
      return { kind: 'length', message: text.tooLong };
    }
    return length === 0 || length >= PASSWORD_MIN_LENGTH
      ? undefined
      : { kind: 'length', message: text.tooShort };
  });
}

/** Required without a message: left empty, the mismatch says why. */
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
 * No `l`/`I`/`1` or `O`/`0`: it gets read off a screen and typed at least
 * once. No symbols: length makes it strong, and they cost more in typing
 * errors than they add.
 */
const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * 20 characters of this alphabet is ~115 bits. `crypto.getRandomValues`, as
 * `Math.random` is predictable; the tail of the byte range is rejected rather
 * than wrapped, so there is no modulo bias.
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
