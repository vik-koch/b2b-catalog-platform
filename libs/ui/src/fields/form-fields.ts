import { FormField, FormRoot } from '@angular/forms/signals';
import { Field } from './field';
import { FieldAction } from './field-action';
import { FieldGroup } from './field-group';
import { FieldBinding } from './field-binding';
import { SubmitAttempt } from './submit-attempt';

/**
 * What a template imports to build a form with fields. One import, because
 * SubmitAttempt and FieldBinding only work beside the Signal Forms directives
 * whose selectors they share.
 */
export const FORM_FIELDS = [
  FormRoot,
  FormField,
  SubmitAttempt,
  Field,
  FieldGroup,
  FieldAction,
  FieldBinding,
] as const;

// The compiler references an imported array's directives through the module
// the array came from (NG3004), so this one re-exports them. They are in the
// array already: no chunk grows.
export { Field, FieldAction, FieldBinding, FieldGroup, SubmitAttempt };
