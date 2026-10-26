import { Directive, signal } from '@angular/core';

/**
 * Whether the form has been sent at least once: every field's required
 * message waits for it. On the same `<form>` as FormRoot, which owns the
 * submit itself.
 */
@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector -- rides on FormRoot's selector, so no form forgets it
  selector: 'form[formRoot]',
  host: { '(submit)': 'attempted.set(true)' },
})
export class SubmitAttempt {
  readonly attempted = signal(false);
}
