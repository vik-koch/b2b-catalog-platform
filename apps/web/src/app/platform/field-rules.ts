import {
  maxLength,
  required,
  validate,
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
} from '@angular/forms/signals';
import {
  digitsOf,
  EMAIL_MAX_LENGTH,
  isEmailAddress,
  maskLength,
} from '@b2b-catalog-platform/shared/platform';

type StringPath<K extends PathKind> = SchemaPath<
  string,
  SchemaPathRules.Supported,
  K
>;

/** Required, with spaces alone counting as nothing, as the save trims them.
 * Both errors are of the `required` kind. */
export function filled<K extends PathKind>(
  path: StringPath<K>,
  message: string,
): void {
  required(path, { message });
  validate(path, ({ value }) =>
    value() !== '' && value().trim() === ''
      ? { kind: 'required', message }
      : undefined,
  );
}

/** The API's email rule, without Zod. Empty is `required`'s message; the
 * cap becomes the control's `maxlength`, so it needs no message. */
export function emailAddress<K extends PathKind>(
  path: StringPath<K>,
  message: string,
): void {
  maxLength(path, EMAIL_MAX_LENGTH);
  validate(path, ({ value }) => {
    const address = value().trim();
    return !address || isEmailAddress(address)
      ? undefined
      : { kind: 'email', message };
  });
}

/** Filled to the mask, even where optional: half a number is a typo. */
export function completeMask<K extends PathKind>(
  path: StringPath<K>,
  mask: string | undefined,
  message: string,
): void {
  if (!mask) return;
  const expected = maskLength(mask);
  validate(path, ({ value }) => {
    const entered = digitsOf(value());
    return !entered || entered.length === expected
      ? undefined
      : { kind: 'incomplete', message };
  });
}
