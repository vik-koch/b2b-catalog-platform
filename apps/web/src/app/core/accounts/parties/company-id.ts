import {
  validate,
  type PathKind,
  type SchemaPath,
  type SchemaPathRules,
} from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared';
import {
  type CompanyIdFormat,
  companyIdMatchesAny,
} from '@b2b-catalog-platform/shared/platform';

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
  path: SchemaPath<string, SchemaPathRules.Supported, K>,
  formats: readonly CompanyIdFormat[] | undefined,
  message: string,
): void {
  const filled = fillText(message, { examples: companyIdExamples(formats) });
  validate(path, ({ value }) => {
    const number = value().trim();
    return !number || companyIdMatchesAny(number, formats)
      ? undefined
      : { kind: 'companyIdFormat', message: filled };
  });
}
