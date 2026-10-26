import {
  validate,
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
} from '@angular/forms/signals';
import {
  type CompanyIdFormat,
  companyIdMatchesAny,
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

/**
 * Every shape a deployment accepts for a company's registration number, as
 * one list for a hint or a message. The field asks for a number, not for a
 * kind of number, so all of them are named.
 */
export function companyIdExamples(
  formats: readonly CompanyIdFormat[] | undefined,
): string {
  // A comma, not a word: the wording around it is the deployment's, and a
  // hard-coded "or" would be one English word inside a localised string.
  return (formats ?? []).map((format) => format.example).join(', ');
}

/**
 * A registration number in one of the deployment's shapes, spaces and case
 * aside. Empty is left to `required`. `{examples}` in the message is filled
 * with every shape.
 */
export function companyIdFormat<K extends PathKind>(
  path: StringPath<K>,
  formats: readonly CompanyIdFormat[] | undefined,
  message: string,
): void {
  const filled = message.replace('{examples}', companyIdExamples(formats));
  validate(path, ({ value }) => {
    const number = value().trim();
    return !number || companyIdMatchesAny(number, formats)
      ? undefined
      : { kind: 'companyIdFormat', message: filled };
  });
}
