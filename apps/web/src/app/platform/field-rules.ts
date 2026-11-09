import { inject } from '@angular/core';
import {
  maxLength,
  readonly,
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
  isPersonName,
  maskLength,
  PERSON_NAME_MAX_LENGTH,
} from '@b2b-catalog-platform/shared/platform';

import { FirstRender } from './first-render';

type StringPath<K extends PathKind> = SchemaPath<
  string,
  SchemaPathRules.Supported,
  K
>;

/**
 * Read-only until the browser has claimed the server's markup, which drops
 * whatever was typed into it (NFR-SEO-05). Not the submit button: disabled, a
 * page's main button would flash grey on every load, and with nothing typed a
 * press only reloads the page. Called from a schema, in `form()`'s context.
 */
export function untilInteractive<T, K extends PathKind>(
  path: SchemaPath<T, SchemaPathRules.Supported, K>,
): void {
  const interactive = inject(FirstRender).interactive;
  readonly(path, { when: () => !interactive() });
}

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

/** A person's name holds no digit. Empty is `required`'s. */
export function personName<K extends PathKind>(
  path: StringPath<K>,
  message: string,
): void {
  maxLength(path, PERSON_NAME_MAX_LENGTH);
  validate(path, ({ value }) =>
    isPersonName(value()) ? undefined : { kind: 'personName', message },
  );
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
