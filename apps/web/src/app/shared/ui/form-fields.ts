import { FormField, FormRoot } from '@angular/forms/signals';
import { Field } from './field';
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
  FieldBinding,
] as const;
