import {
  computed,
  Directive,
  forwardRef,
  input,
  signal,
  type WritableSignal,
} from '@angular/core';
import { FIELD_ATTEMPT } from './field-attempt';

/**
 * Kept with the form rather than with the `<form>` element drawing it: a page
 * that steps away and back, as checkout does to its read-back, draws the
 * element anew, and the fields must still say what was wrong.
 */
const attempts = new WeakMap<object, WritableSignal<boolean>>();

/**
 * Whether this form has been sent at least once, for a page that sends it
 * other than by the `<form>`'s own submit, or that wants to forget it.
 */
export function submitAttempt(form: object): WritableSignal<boolean> {
  let attempt = attempts.get(form);
  if (!attempt) {
    attempt = signal(false);
    attempts.set(form, attempt);
  }
  return attempt;
}

/**
 * Whether the form has been sent at least once: every field's required
 * message waits for it. On the same `<form>` as FormRoot, which owns the
 * submit itself, and reading the same form.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector -- rides on FormRoot's selector, so no form forgets it
  selector: 'form[formRoot]',
  host: { '(submit)': 'mark()' },
  providers: [
    { provide: FIELD_ATTEMPT, useExisting: forwardRef(() => SubmitAttempt) },
  ],
})
export class SubmitAttempt {
  /** The form FormRoot is given, used here only as the key to its attempt. */
  readonly formRoot = input.required<object>();

  readonly attempted = computed(() => submitAttempt(this.formRoot())());

  protected mark(): void {
    submitAttempt(this.formRoot()).set(true);
  }

  /**
   * Back to silence, for a form emptied for another go. Without it the
   * cleared required fields would all light up beside the answer.
   */
  reset(): void {
    submitAttempt(this.formRoot()).set(false);
  }
}
