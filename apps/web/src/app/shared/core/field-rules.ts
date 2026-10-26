import {
  validate,
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
} from '@angular/forms/signals';
import {
  digitsOf,
  isEmailAddress,
  maskLength,
} from '@b2b-catalog-platform/shared';

type StringPath<K extends PathKind> = SchemaPath<
  string,
  SchemaPathRules.Supported,
  K
>;

/**
 * The email rule the API applies, from the shared pattern rather than the
 * contract's schema, so a form that checks an address loads no Zod. Empty is
 * left to `required`: skipped and malformed are two different messages.
 */
export function emailAddress<K extends PathKind>(
  path: StringPath<K>,
  message: string,
): void {
  validate(path, ({ value }) => {
    const address = value().trim();
    return !address || isEmailAddress(address)
      ? undefined
      : { kind: 'email', message };
  });
}

/**
 * A masked number must be filled to the mask's length, even where it is
 * optional: empty is a choice, half a number is a typo. No mask, no rule.
 */
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
