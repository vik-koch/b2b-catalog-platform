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

/** Every accepted shape's example, for a hint or a message. */
export function companyIdExamples(
  formats: readonly CompanyIdFormat[] | undefined,
): string {
  // A comma, not "or": the words around it are the deployment's language.
  return (formats ?? []).map((format) => format.example).join(', ');
}

/** One of the deployment's shapes, spaces and case aside; empty is
 * `required`'s. `{examples}` in the message names every shape. */
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
